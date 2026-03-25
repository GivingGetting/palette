import { StyleDNASchema, type StyleDNA } from "./schema";
import type { ScrapeResult } from "./scraper";

const SYSTEM_PROMPT = `You are a professional design system analyst specializing in visual style extraction.

Your task is to analyze CSS data from a website and output a precise Style DNA JSON object.

## Rules

1. Output ONLY valid minified JSON — no markdown fences, no prose, no comments, no whitespace or indentation between tokens.
2. All hex colors must be exactly 7 characters: #RRGGBB (uppercase letters).
3. All numeric values must be actual numbers, not strings.
4. The "language" field in "aesthetic" must be a fluent English description (~100 words) of the overall visual personality suitable for injection into an image generation prompt.
5. If you cannot determine a value with confidence, make a reasonable inference from the available CSS evidence.
6. The "confidence" field (0–1) reflects your overall certainty across all dimensions.

## Output Schema

Return a JSON object that strictly conforms to this TypeScript interface:

interface StyleDNA {
  meta: { source_url: string | null; source_type: "url" | "image"; analyzed_at: string; analyzer_ver: string; confidence: number }
  colors: {
    primary: ColorToken; secondary: ColorToken[]; background: ColorToken; surface: ColorToken
    accent: ColorToken[]; semantic: { success: ColorToken; warning: ColorToken; error: ColorToken; info: ColorToken }
    palette: ColorToken[]
  }
  typography: {
    primary_font: FontToken; secondary_font?: FontToken
    scale: { display: TypographyStyle; heading1: TypographyStyle; heading2: TypographyStyle; body: TypographyStyle; caption: TypographyStyle; code?: TypographyStyle }
  }
  spacing: { base_unit: number; scale: number[]; container_max_width: number }
  radius: { none: 0; sm: number; md: number; lg: number; xl: number; full: 9999; default: "sm" | "md" | "lg" | "xl" }
  components: {
    button: { style: "filled"|"outlined"|"ghost"|"link"; radius_ref: "sm"|"md"|"lg"|"full"; has_shadow: boolean }
    input:  { style: "outlined"|"filled"|"underline"; radius_ref: "sm"|"md"|"lg" }
    card:   { style: "elevated"|"outlined"|"flat"; radius_ref: "sm"|"md"|"lg"|"xl" }
    nav:    { type: "top"|"sidebar"|"bottom"; style: "transparent"|"filled"|"blur" }
  }
  aesthetic: {
    mode: "light" | "dark" | "both"; density: "compact" | "medium" | "airy"
    personality: string[]; motion: "none" | "subtle" | "expressive"; language: string
  }
}
interface ColorToken { hex: string; name: string; usage: string }
interface FontToken  { family: string; source: "system"|"google"|"custom"; weights: number[] }
interface TypographyStyle { size: number; weight: number; line_height: number; letter_spacing: number }`;

export interface OllamaOptions {
  baseUrl?: string;
  model?: string;
  sourceUrl?: string;
  sourceType: "url" | "image";
  screenshotBase64?: string;
}

export async function analyzeWithOllama(
  scrapeResult: ScrapeResult,
  options: OllamaOptions
): Promise<StyleDNA> {
  const baseUrl = (options.baseUrl ?? "http://localhost:11434").replace(/\/$/, "");
  const model = options.model ?? "qwen2.5:14b";
  // Truncate CSS to ~8000 chars to stay within model context limits
  const MAX_CSS = 4000;
  const fullCss = JSON.stringify(scrapeResult.cssSummary, null, 2);
  const cssData = fullCss.length > MAX_CSS ? fullCss.slice(0, MAX_CSS) + "\n... (truncated)" : fullCss;

  // Only pass screenshot for image source type (URL screenshots consume too many visual tokens,
  // leaving insufficient context for JSON output)
  const hasScreenshot = options.sourceType === "image" && !!options.screenshotBase64;
  const userPrompt = hasScreenshot
    ? `Analyze the screenshot and CSS data below to extract a complete Style DNA.
The screenshot shows the actual visual appearance of the website/design.

Source URL: ${options.sourceUrl ?? "N/A"}
Source type: ${options.sourceType}
Current time (ISO 8601): ${new Date().toISOString()}

--- CSS DATA ---
${cssData}
--- END CSS DATA ---

Output only the Style DNA JSON. Minified, no whitespace. No markdown, no explanation.`
    : `Analyze the CSS data below and extract a complete Style DNA.
Note: No screenshot is available — infer visual style from CSS variables, font declarations, and element styles.

Source URL: ${options.sourceUrl ?? "N/A"}
Source type: ${options.sourceType}
Current time (ISO 8601): ${new Date().toISOString()}

--- CSS DATA ---
${cssData}
--- END CSS DATA ---

Output only the Style DNA JSON. Minified, no whitespace. No markdown, no explanation.`;

  // Warn if image is too large for local vision model
  if (hasScreenshot && options.screenshotBase64) {
    const sizeKB = Math.round(options.screenshotBase64.length * 0.75 / 1024);
    if (sizeKB > 1024) {
      throw new Error(`图片过大（约 ${sizeKB} KB），本地视觉模型处理会超时。建议切换到 Claude 引擎，或上传更小的图片（< 1 MB）。`);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 600_000); // 10 min

  const res = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      model,
      stream: true,
      // Image analysis needs fewer context tokens (visual tokens ~1600 + prompts ~700 + output ~1500).
      // Smaller num_ctx reduces KV cache memory, avoiding swap thrash on 16 GB M4.
      // repeat_penalty: 1.0 disables Ollama's default repetition penalty (1.1), which otherwise
      // stops generation early when JSON has repeated structures (same color objects, etc.).
      options: {
        num_ctx: 8192,
        num_predict: 8192,
        repeat_penalty: 1.0,
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: userPrompt,
          ...(hasScreenshot ? { images: [options.screenshotBase64!] } : {}),
        },
      ],
    }),
  });

  if (!res.ok) {
    clearTimeout(timeoutId);
    const errText = await res.text().catch(() => "");
    throw new Error(`Ollama 请求失败 ${res.status}: ${errText.slice(0, 200)}`);
  }

  // Collect streamed response chunks.
  // Buffer incomplete lines: a single JSON line can be split across two reader.read() calls,
  // which would cause JSON.parse to fail and silently drop content.
  let rawText = "";
  let lineBuffer = "";
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  outer: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    lineBuffer += decoder.decode(value, { stream: true });
    const lines = lineBuffer.split("\n");
    lineBuffer = lines.pop() ?? ""; // keep the incomplete last fragment
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        rawText += chunk?.message?.content ?? chunk?.response ?? "";
        if (chunk.done) {
          console.log(`[ollama] done=true, total chars: ${rawText.length}, reason: ${chunk.done_reason ?? "?"}`);
          break outer;
        }
      } catch { /* skip malformed lines */ }
    }
  }
  // Flush any remaining buffer content
  if (lineBuffer.trim()) {
    try {
      const chunk = JSON.parse(lineBuffer);
      rawText += chunk?.message?.content ?? chunk?.response ?? "";
    } catch { /* ignore */ }
  }
  clearTimeout(timeoutId);

  if (!rawText.trim()) throw new Error("Ollama 返回了空内容");

  console.log(`[ollama] raw response (first 300): ${rawText.slice(0, 300)}`);

  // Extract JSON: try markdown fence first, then find outermost { ... }
  let jsonText: string;
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonText = fenceMatch[1].trim();
  } else {
    const start = rawText.indexOf("{");
    const end = rawText.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error(`Ollama 返回内容中找不到 JSON 对象: ${rawText.slice(0, 200)}`);
    }
    jsonText = rawText.slice(start, end + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error(`Ollama 返回的不是合法 JSON (len=${jsonText.length}): ${jsonText.slice(0, 500)}`);
  }

  // Unwrap if model wrapped the result in a container key
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    const wrapperKeys = ["style_dna", "styleDna", "data", "result", "output", "response"];
    for (const key of wrapperKeys) {
      if (obj[key] && typeof obj[key] === "object") {
        console.log(`[ollama] unwrapping from key: ${key}`);
        parsed = obj[key];
        break;
      }
    }
  }

  // Fill in required fields that vision models often omit (hard to infer from screenshots alone).
  // Must run AFTER unwrapping so we operate on the actual StyleDNA object, not a wrapper.
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const p = parsed as Record<string, unknown>;
    const typoStyle = (size: number, weight: number, lh: number, ls: number) =>
      ({ size, weight, line_height: lh, letter_spacing: ls });
    if (p.typography && typeof p.typography === "object") {
      const t = p.typography as Record<string, unknown>;
      if (!t.scale || typeof t.scale !== "object") {
        t.scale = {
          display:  typoStyle(48, 700, 1.2, -0.5),
          heading1: typoStyle(32, 700, 1.3, -0.3),
          heading2: typoStyle(24, 600, 1.4, -0.2),
          body:     typoStyle(16, 400, 1.6,  0.0),
          caption:  typoStyle(12, 400, 1.4,  0.2),
        };
      } else {
        const s = t.scale as Record<string, unknown>;
        if (!s.display)  s.display  = typoStyle(48, 700, 1.2, -0.5);
        if (!s.heading1) s.heading1 = typoStyle(32, 700, 1.3, -0.3);
        if (!s.heading2) s.heading2 = typoStyle(24, 600, 1.4, -0.2);
        if (!s.body)     s.body     = typoStyle(16, 400, 1.6,  0.0);
        if (!s.caption)  s.caption  = typoStyle(12, 400, 1.4,  0.2);
      }
    }
    if (p.components && typeof p.components === "object") {
      const c = p.components as Record<string, unknown>;
      if (!c.nav) c.nav = { type: "top", style: "filled" };
    }
  }

  const result = StyleDNASchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    console.error(`[ollama] schema validation failed. parsed keys: ${Object.keys(parsed as object).join(", ")}`);
    throw new Error(`Style DNA 校验失败: ${issues}`);
  }

  result.data.meta.source_url = options.sourceUrl ?? null;
  result.data.meta.source_type = options.sourceType;
  return result.data;
}
