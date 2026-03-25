import { chromium, type Page } from "playwright";

export interface ScrapeResult {
  screenshotBase64: string;
  cssSummary: CssSummary;
}

interface CssSummary {
  cssVariables: Record<string, string>;
  topElements: ElementStyle[];
  fonts: string[];
  mediaQueries: string[];
}

interface ElementStyle {
  tag: string;
  classes: string[];
  styles: Record<string, string>;
}

// CSS properties most relevant for style analysis
const RELEVANT_PROPS = [
  "color",
  "background-color",
  "background",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "border-radius",
  "border",
  "border-color",
  "padding",
  "margin",
  "box-shadow",
  "text-decoration",
  "opacity",
] as const;

export async function scrapePage(url: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Wait for any lazy-loaded content
    await page.waitForTimeout(1500);

    const [screenshotBuffer, cssSummary] = await Promise.all([
      page.screenshot({ fullPage: false, type: "png" }),
      extractCssSummary(page),
    ]);

    return {
      screenshotBase64: screenshotBuffer.toString("base64"),
      cssSummary,
    };
  } finally {
    await browser.close();
  }
}

async function extractCssSummary(page: Page): Promise<CssSummary> {
  return page.evaluate((relevantProps) => {
    // ── CSS custom variables ────────────────────────────────────────────────
    const cssVariables: Record<string, string> = {};
    const sheets = Array.from(document.styleSheets);

    for (const sheet of sheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);
        for (const rule of rules) {
          if (rule instanceof CSSStyleRule && rule.selectorText === ":root") {
            const style = rule.style;
            for (let i = 0; i < style.length; i++) {
              const prop = style[i];
              if (prop.startsWith("--")) {
                cssVariables[prop] = style.getPropertyValue(prop).trim();
              }
            }
          }
        }
      } catch {
        // Cross-origin stylesheets throw — skip silently
      }
    }

    // ── Top 100 elements' computed styles ───────────────────────────────────
    const elements = Array.from(document.querySelectorAll("*")).slice(0, 100);
    const topElements: Array<{
      tag: string;
      classes: string[];
      styles: Record<string, string>;
    }> = [];

    for (const el of elements) {
      const computed = window.getComputedStyle(el);
      const styles: Record<string, string> = {};

      for (const prop of relevantProps) {
        const val = computed.getPropertyValue(prop).trim();
        if (val && val !== "none" && val !== "normal" && val !== "auto") {
          styles[prop] = val;
        }
      }

      if (Object.keys(styles).length > 0) {
        topElements.push({
          tag: el.tagName.toLowerCase(),
          classes: Array.from(el.classList).slice(0, 5),
          styles,
        });
      }
    }

    // ── Fonts in use ────────────────────────────────────────────────────────
    const fontSet = new Set<string>();
    for (const el of topElements) {
      const ff = el.styles["font-family"];
      if (ff) fontSet.add(ff);
    }

    // ── Media queries ───────────────────────────────────────────────────────
    const mediaQueries: string[] = [];
    for (const sheet of sheets) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (rule instanceof CSSMediaRule) {
            mediaQueries.push(rule.conditionText);
          }
        }
      } catch {
        // skip
      }
    }

    return {
      cssVariables,
      topElements: topElements.slice(0, 60), // cap payload size
      fonts: Array.from(fontSet).slice(0, 10),
      mediaQueries: [...new Set(mediaQueries)].slice(0, 20),
    };
  }, RELEVANT_PROPS as unknown as string[]);
}

/** Estimate token count (rough: ~4 chars per token) */
export function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 4);
}
