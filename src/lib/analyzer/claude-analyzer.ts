import Anthropic from "@anthropic-ai/sdk";
import { StyleDNASchema, type StyleDNA } from "./schema";
import type { ScrapeResult } from "./scraper";

const SYSTEM_PROMPT = `You are a professional design system analyst specializing in visual style extraction.

Your task is to analyze a website screenshot and its CSS data, then output a precise Style DNA JSON object.

## Rules

1. Output ONLY valid JSON — no markdown fences, no prose, no comments.
2. All hex colors must be exactly 7 characters: #RRGGBB (uppercase letters).
3. All numeric values must be actual numbers, not strings.
4. The "language" field in "aesthetic" must be a fluent English description (~100 words) of the overall visual personality suitable for injection into an image generation prompt.
5. If you cannot determine a value with confidence, make a reasonable inference from the available evidence.
6. The "confidence" field (0–1) reflects your overall certainty across all dimensions.

## Output Schema

Return a JSON object that strictly conforms to this TypeScript interface:

\`\`\`typescript
interface StyleDNA {
  meta: {
    source_url: string | null
    source_type: "url" | "image"
    analyzed_at: string        // ISO 8601
    analyzer_ver: string       // "1.0.0"
    confidence: number         // 0–1
  }
  colors: {
    primary: ColorToken
    secondary: ColorToken[]
    background: ColorToken
    surface: ColorToken
    accent: ColorToken[]
    semantic: { success: ColorToken; warning: ColorToken; error: ColorToken; info: ColorToken }
    palette: ColorToken[]      // max 12
  }
  typography: {
    primary_font: FontToken
    secondary_font?: FontToken
    scale: {
      display: TypographyStyle
      heading1: TypographyStyle
      heading2: TypographyStyle
      body: TypographyStyle
      caption: TypographyStyle
      code?: TypographyStyle
    }
  }
  spacing: {
    base_unit: number          // px, typically 4 or 8
    scale: number[]            // e.g. [4, 8, 12, 16, 24, 32, 48, 64]
    container_max_width: number
  }
  radius: {
    none: 0
    sm: number
    md: number
    lg: number
    xl: number
    full: 9999
    default: "sm" | "md" | "lg" | "xl"
  }
  components: {
    button: { style: "filled"|"outlined"|"ghost"|"link"; radius_ref: "sm"|"md"|"lg"|"full"; has_shadow: boolean }
    input:  { style: "outlined"|"filled"|"underline"; radius_ref: "sm"|"md"|"lg" }
    card:   { style: "elevated"|"outlined"|"flat"; radius_ref: "sm"|"md"|"lg"|"xl" }
    nav:    { type: "top"|"sidebar"|"bottom"; style: "transparent"|"filled"|"blur" }
  }
  aesthetic: {
    mode: "light" | "dark" | "both"
    density: "compact" | "medium" | "airy"
    personality: string[]      // 3–6 keywords
    motion: "none" | "subtle" | "expressive"
    language: string           // ~100 word natural language style description
  }
}

interface ColorToken { hex: string; name: string; usage: string }
interface FontToken  { family: string; source: "system"|"google"|"custom"; weights: number[] }
interface TypographyStyle { size: number; weight: number; line_height: number; letter_spacing: number }
\`\`\`
`;

interface AnalyzeOptions {
  sourceUrl?: string;
  sourceType: "url" | "image";
  mediaType?: string;
  apiKey?: string;
}

export async function analyzeWithClaude(
  scrapeResult: ScrapeResult,
  options: AnalyzeOptions
): Promise<StyleDNA> {
  const client = new Anthropic(options.apiKey ? { apiKey: options.apiKey } : {});
  const { screenshotBase64, cssSummary } = scrapeResult;
  const mediaType = (options.mediaType ?? "image/png") as "image/png" | "image/jpeg" | "image/gif" | "image/webp";

  const userContent: Anthropic.MessageParam["content"] = [];

  if (screenshotBase64) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: screenshotBase64,
      },
    });
  }

  userContent.push({
    type: "text",
    text: buildUserPrompt(cssSummary, options),
  });

  const response = await client.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const rawJson = extractJson(response);
  return parseAndValidate(rawJson, options);
}

function buildUserPrompt(
  cssSummary: ReturnType<() => import("./scraper").ScrapeResult["cssSummary"]>,
  options: AnalyzeOptions
): string {
  const cssData = JSON.stringify(cssSummary, null, 2);

  return `Analyze the screenshot and CSS data below. Extract the complete Style DNA.

Source URL: ${options.sourceUrl ?? "N/A"}
Source type: ${options.sourceType}
Current time (ISO 8601): ${new Date().toISOString()}

--- CSS DATA ---
${cssData}
--- END CSS DATA ---

Output only the Style DNA JSON. No markdown, no explanation.`;
}

function extractJson(response: Anthropic.Message): string {
  // Find the text block in the response (skip thinking blocks)
  for (const block of response.content) {
    if (block.type === "text") {
      const text = block.text.trim();

      // Strip markdown fences if Claude added them despite instructions
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) return fenceMatch[1].trim();

      return text;
    }
  }

  throw new Error("No text block found in Claude response");
}

function parseAndValidate(rawJson: string, options: AnalyzeOptions): StyleDNA {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawJson);
  } catch (err) {
    throw new Error(`Claude returned invalid JSON: ${err}`);
  }

  const result = StyleDNASchema.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Style DNA schema validation failed:\n${issues}`);
  }

  // Ensure meta fields are set correctly
  result.data.meta.source_url = options.sourceUrl ?? null;
  result.data.meta.source_type = options.sourceType;

  return result.data;
}
