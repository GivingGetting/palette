import { z } from "zod";

// ─── Base tokens ───────────────────────────────────────────────────────────────

export const ColorTokenSchema = z.object({
  hex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color"),
  name: z.string(),
  usage: z.string(),
});

export const FontTokenSchema = z.object({
  family: z.string(),
  source: z.enum(["system", "google", "custom"]),
  weights: z.array(z.number()),
});

export const TypographyStyleSchema = z.object({
  size: z.number(),
  weight: z.number(),
  line_height: z.number(),
  letter_spacing: z.number(),
});

// ─── Style DNA ─────────────────────────────────────────────────────────────────

export const StyleDNASchema = z.object({
  meta: z.object({
    source_url: z.string().nullable(),
    source_type: z.enum(["url", "image"]),
    analyzed_at: z.string(),
    analyzer_ver: z.string(),
    confidence: z.number().min(0).max(1),
  }),

  colors: z.object({
    primary: ColorTokenSchema,
    secondary: z.array(ColorTokenSchema),
    background: ColorTokenSchema,
    surface: ColorTokenSchema,
    accent: z.array(ColorTokenSchema),
    semantic: z.object({
      success: ColorTokenSchema,
      warning: ColorTokenSchema,
      error: ColorTokenSchema,
      info: ColorTokenSchema,
    }),
    palette: z.array(ColorTokenSchema).max(12),
  }),

  typography: z.object({
    primary_font: FontTokenSchema,
    secondary_font: FontTokenSchema.optional().nullable(),
    scale: z.object({
      display: TypographyStyleSchema,
      heading1: TypographyStyleSchema,
      heading2: TypographyStyleSchema,
      body: TypographyStyleSchema,
      caption: TypographyStyleSchema,
      code: TypographyStyleSchema.optional().nullable(),
    }),
  }),

  spacing: z.object({
    base_unit: z.number(),
    scale: z.array(z.number()),
    container_max_width: z.number(),
  }),

  radius: z.object({
    none: z.literal(0),
    sm: z.number(),
    md: z.number(),
    lg: z.number(),
    xl: z.number(),
    full: z.literal(9999),
    default: z.enum(["sm", "md", "lg", "xl"]),
  }),

  components: z.object({
    button: z.object({
      style: z.enum(["filled", "outlined", "ghost", "link"]),
      radius_ref: z.enum(["sm", "md", "lg", "full"]),
      has_shadow: z.boolean(),
    }),
    input: z.object({
      style: z.enum(["outlined", "filled", "underline"]),
      radius_ref: z.enum(["sm", "md", "lg"]),
    }),
    card: z.object({
      style: z.enum(["elevated", "outlined", "flat"]),
      radius_ref: z.enum(["sm", "md", "lg", "xl"]),
    }),
    nav: z.object({
      type: z.enum(["top", "sidebar", "bottom"]),
      style: z.enum(["transparent", "filled", "blur"]),
    }),
  }),

  aesthetic: z.object({
    mode: z.enum(["light", "dark", "both"]),
    density: z.enum(["compact", "medium", "airy"]),
    personality: z.array(z.string()),
    motion: z.enum(["none", "subtle", "expressive"]),
    language: z.string(),
  }),
});

export type StyleDNA = z.infer<typeof StyleDNASchema>;
export type ColorToken = z.infer<typeof ColorTokenSchema>;
export type FontToken = z.infer<typeof FontTokenSchema>;
export type TypographyStyle = z.infer<typeof TypographyStyleSchema>;
