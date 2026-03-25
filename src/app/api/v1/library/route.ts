import { NextResponse } from "next/server";
import { getLibrary } from "@/lib/store/library";

export async function GET() {
  const items = getLibrary().map((item) => ({
    id: item.id,
    createdAt: item.createdAt,
    source_url: item.styleDna.meta.source_url,
    source_type: item.styleDna.meta.source_type,
    confidence: item.styleDna.meta.confidence,
    palette: item.styleDna.colors.palette.slice(0, 6).map((c) => c.hex),
    primary: item.styleDna.colors.primary.hex,
    font: item.styleDna.typography.primary_font.family,
    personality: item.styleDna.aesthetic.personality,
    mode: item.styleDna.aesthetic.mode,
  }));

  return NextResponse.json({ data: items, total: items.length });
}
