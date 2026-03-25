import type { StyleDNA } from "./schema";

/**
 * Serialize a Style DNA into a natural-language prompt fragment for image generation.
 * This file is safe to import in client components (no Node.js deps).
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
