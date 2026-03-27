import { scrapePage, estimateTokens } from "./scraper";
import { analyzeWithClaude } from "./claude-analyzer";
import { analyzeWithOllama } from "./ollama-analyzer";
import type { StyleDNA } from "./schema";

export interface EngineConfig {
  engine: "claude" | "ollama";
  ollamaUrl?: string;
  ollamaModel?: string;
}

export { StyleDNASchema } from "./schema";
export type { StyleDNA } from "./schema";

// ─── Public API ────────────────────────────────────────────────────────────────

export interface AnalyzeUrlOptions {
  onProgress?: (step: string, percent: number) => void;
  maxRetries?: number;
  engine?: EngineConfig;
  anthropicApiKey?: string;
}

export interface AnalyzeImageOptions {
  onProgress?: (step: string, percent: number) => void;
  maxRetries?: number;
  mediaType?: string;
  engine?: EngineConfig;
  anthropicApiKey?: string;
}

export interface AnalyzeResult {
  styleDna: StyleDNA;
  /** Rough token count of the CSS payload sent to Claude */
  cssTokensUsed: number;
}

/**
 * Analyze a URL: scrape → Claude Vision → Zod validation
 */
export async function analyzeUrl(
  url: string,
  options: AnalyzeUrlOptions = {}
): Promise<AnalyzeResult> {
  const { onProgress, maxRetries = 2, engine, anthropicApiKey } = options;
  const useOllama = engine?.engine === "ollama";

  onProgress?.("正在启动浏览器…", 0.05);
  const scrapeResult = await scrapePage(url);

  onProgress?.("正在分析页面样式…", 0.35);
  const cssTokensUsed = estimateTokens(scrapeResult.cssSummary);

  onProgress?.(`正在提取 Style DNA（${useOllama ? "Ollama" : "Claude"}）…`, 0.50);
  const styleDna = await analyzeWithRetry(
    () => useOllama
      ? analyzeWithOllama(scrapeResult, { baseUrl: engine.ollamaUrl, model: engine.ollamaModel, sourceUrl: url, sourceType: "url", screenshotBase64: scrapeResult.screenshotBase64 })
      : analyzeWithClaude(scrapeResult, { sourceUrl: url, sourceType: "url", apiKey: anthropicApiKey }),
    maxRetries,
    onProgress
  );

  onProgress?.("完成", 1.0);
  return { styleDna, cssTokensUsed };
}

/**
 * Analyze an uploaded image (base64): skip scraping, go straight to Claude Vision
 */
export async function analyzeImage(
  imageBase64: string,
  options: AnalyzeImageOptions = {}
): Promise<AnalyzeResult> {
  const { onProgress, maxRetries = 2, mediaType = "image/png", engine, anthropicApiKey } = options;
  const useOllama = engine?.engine === "ollama";

  onProgress?.("正在分析图片…", 0.20);

  const scrapeResult = {
    screenshotBase64: imageBase64,
    cssSummary: { cssVariables: {}, topElements: [], fonts: [], mediaQueries: [] },
  };

  onProgress?.(`正在提取 Style DNA（${useOllama ? "Ollama" : "Claude"}）…`, 0.50);
  const styleDna = await analyzeWithRetry(
    () => useOllama
      ? analyzeWithOllama(scrapeResult, { baseUrl: engine.ollamaUrl, model: engine.ollamaModel, sourceType: "image", screenshotBase64: imageBase64 })
      : analyzeWithClaude(scrapeResult, { sourceType: "image", mediaType, apiKey: anthropicApiKey }),
    maxRetries,
    onProgress
  );

  onProgress?.("完成", 1.0);
  return { styleDna, cssTokensUsed: 0 };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

async function analyzeWithRetry(
  fn: () => Promise<StyleDNA>,
  maxRetries: number,
  onProgress?: (step: string, percent: number) => void
): Promise<StyleDNA> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < maxRetries) {
        onProgress?.(
          `校验失败，正在重试 (${attempt}/${maxRetries - 1})…`,
          0.5 + attempt * 0.1
        );
        console.warn(`[analyzer] Attempt ${attempt} failed:`, lastError.message);
      }
    }
  }

  throw lastError ?? new Error("Analysis failed after all retries");
}

// ─── Style DNA → Prompt injection ──────────────────────────────────────────────

/**
 * Serialize a Style DNA into a natural-language prompt fragment for image generation.
 */
export function buildStylePrompt(dna: StyleDNA): string {
  const accents = dna.colors.accent.map((c) => c.hex).join(", ");

  return `
Design style reference:
- Color palette: ${dna.colors.primary.hex} (primary), ${accents} (accents)
- Background: ${dna.colors.background.hex}
- Typography: ${dna.typography.primary_font.family}, body ${dna.typography.scale.body.size}px/${dna.typography.scale.body.line_height}
- Border radius: ${dna.radius.default} (${dna.radius[dna.radius.default]}px)
- Density: ${dna.aesthetic.density}
- Mode: ${dna.aesthetic.mode}
- Style: ${dna.aesthetic.language}

Apply this design language strictly to the generated image.
  `.trim();
}
