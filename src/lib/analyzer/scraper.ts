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

// ── Fetch HTML + linked CSS, parse without a browser ────────────────────────

export async function scrapePage(url: string): Promise<ScrapeResult> {
  const html = await fetchText(url);
  const cssTexts = await fetchLinkedCss(url, html);

  // Inline <style> blocks
  const styleTagRe = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleTagRe.exec(html)) !== null) {
    cssTexts.push(m[1]);
  }

  const allCss = cssTexts.join("\n");
  const cssSummary = parseCss(allCss);

  return {
    screenshotBase64: "", // no browser → no screenshot in URL mode
    cssSummary,
  };
}

// ── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

async function fetchLinkedCss(baseUrl: string, html: string): Promise<string[]> {
  const base = new URL(baseUrl);
  const hrefRe = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi;
  const hrefs: string[] = [];
  let m: RegExpExecArray | null;

  while ((m = hrefRe.exec(html)) !== null) {
    try {
      hrefs.push(new URL(m[1], base).href);
    } catch {
      // malformed href — skip
    }
  }

  // Fetch up to 8 stylesheets concurrently; ignore failures
  const results = await Promise.allSettled(
    hrefs.slice(0, 8).map((href) => fetchText(href))
  );

  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);
}

// ── CSS parser ───────────────────────────────────────────────────────────────

function parseCss(css: string): CssSummary {
  const cssVariables = extractCssVariables(css);
  const fonts = extractFonts(css);
  const mediaQueries = extractMediaQueries(css);
  const topElements = extractTopElements(css);

  return { cssVariables, topElements, fonts, mediaQueries };
}

/** Extract CSS custom properties from :root { } blocks */
function extractCssVariables(css: string): Record<string, string> {
  const vars: Record<string, string> = {};
  // Match :root { ... } (non-greedy, handles multiple blocks)
  const rootRe = /:root\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rootRe.exec(css)) !== null) {
    const block = m[1];
    const propRe = /(--[\w-]+)\s*:\s*([^;]+);/g;
    let p: RegExpExecArray | null;
    while ((p = propRe.exec(block)) !== null) {
      vars[p[1].trim()] = p[2].trim();
    }
  }
  return vars;
}

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

type RelevantProp = (typeof RELEVANT_PROPS)[number];

/** Extract representative element styles from CSS rules */
function extractTopElements(css: string): ElementStyle[] {
  const elements: ElementStyle[] = [];

  // Match selector { declarations }
  const ruleRe = /([^{}@][^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;

  while ((m = ruleRe.exec(css)) !== null && elements.length < 60) {
    const selector = m[1].trim();
    const declarations = m[2];

    // Only look at simple tag / class selectors; skip long combinator chains
    if (selector.length > 120) continue;

    const styles: Record<string, string> = {};

    for (const prop of RELEVANT_PROPS) {
      const re = new RegExp(`(?:^|;)\\s*${escapeRegex(prop)}\\s*:\\s*([^;]+)`, "i");
      const hit = declarations.match(re);
      if (hit) {
        const val = hit[1].trim();
        if (val && val !== "none" && val !== "normal" && val !== "auto" && val !== "inherit") {
          styles[prop as RelevantProp] = val;
        }
      }
    }

    if (Object.keys(styles).length === 0) continue;

    // Derive a pseudo tag + classes from the selector
    const tagMatch = selector.match(/^([a-z][a-z0-9]*)/i);
    const classMatches = [...selector.matchAll(/\.([\w-]+)/g)].map((x) => x[1]);

    elements.push({
      tag: tagMatch ? tagMatch[1].toLowerCase() : "div",
      classes: classMatches.slice(0, 5),
      styles,
    });
  }

  return elements;
}

/** Extract font-family values */
function extractFonts(css: string): string[] {
  const fontSet = new Set<string>();
  const re = /font-family\s*:\s*([^;]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null && fontSet.size < 10) {
    fontSet.add(m[1].trim().replace(/^['"]|['"]$/g, ""));
  }
  return [...fontSet].slice(0, 10);
}

/** Extract @media query conditions */
function extractMediaQueries(css: string): string[] {
  const mqs = new Set<string>();
  const re = /@media\s+([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null && mqs.size < 20) {
    mqs.add(m[1].trim());
  }
  return [...mqs].slice(0, 20);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Estimate token count (rough: ~4 chars per token) */
export function estimateTokens(obj: unknown): number {
  return Math.ceil(JSON.stringify(obj).length / 4);
}
