import { NextResponse } from "next/server";
import { getLibraryItem, deleteLibraryItem } from "@/lib/store/library";
import { createServerClient, extractToken } from "@/lib/supabase-server";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = createServerClient(token);
  const item = await getLibraryItem(db, id);

  if (!item) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }

  return NextResponse.json({ id: item.id, result: item.styleDna, createdAt: item.createdAt });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const token = extractToken(req);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = createServerClient(token);
  const deleted = await deleteLibraryItem(db, id);

  if (!deleted) {
    return NextResponse.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
