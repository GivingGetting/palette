import { NextResponse } from "next/server";
import { getLibraryItem, deleteLibraryItem } from "@/lib/store/library";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = getLibraryItem(id);

  if (!item) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }

  return NextResponse.json({ id: item.id, result: item.styleDna, createdAt: item.createdAt });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deleted = deleteLibraryItem(id);

  if (!deleted) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
