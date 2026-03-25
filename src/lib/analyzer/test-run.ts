/**
 * Quick smoke test — run with:
 *   npx tsx src/lib/analyzer/test-run.ts [url]
 *
 * Requires: ANTHROPIC_API_KEY in env
 */

import { analyzeUrl, buildStylePrompt } from "./index";

const url = process.argv[2] ?? "https://stripe.com";

console.log(`\n🔍  Analyzing: ${url}\n`);

analyzeUrl(url, {
  onProgress(step, pct) {
    const bar = "█".repeat(Math.round(pct * 20)).padEnd(20, "░");
    process.stdout.write(`\r[${bar}] ${Math.round(pct * 100)}%  ${step}   `);
  },
})
  .then(({ styleDna, cssTokensUsed }) => {
    console.log("\n\n✅  Analysis complete\n");
    console.log(`CSS payload ~${cssTokensUsed} tokens\n`);

    console.log("─── Colors ───────────────────────────");
    console.log("  Primary :", styleDna.colors.primary.hex, styleDna.colors.primary.name);
    console.log("  BG      :", styleDna.colors.background.hex);
    console.log("  Palette :", styleDna.colors.palette.map((c) => c.hex).join("  "));

    console.log("\n─── Typography ───────────────────────");
    console.log("  Font    :", styleDna.typography.primary_font.family);
    console.log("  Body    :", styleDna.typography.scale.body.size + "px", "/ lh", styleDna.typography.scale.body.line_height);

    console.log("\n─── Aesthetic ────────────────────────");
    console.log("  Mode    :", styleDna.aesthetic.mode);
    console.log("  Density :", styleDna.aesthetic.density);
    console.log("  Tags    :", styleDna.aesthetic.personality.join(", "));
    console.log("  Confidence:", styleDna.meta.confidence);

    console.log("\n─── Style Prompt ─────────────────────");
    console.log(buildStylePrompt(styleDna));
    console.log();
  })
  .catch((err) => {
    console.error("\n\n❌  Failed:", err.message);
    process.exit(1);
  });
