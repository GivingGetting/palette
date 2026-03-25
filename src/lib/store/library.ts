import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleDNA } from "@/lib/analyzer/schema";

export interface LibraryItem {
  id: string;
  styleDna: StyleDNA;
  createdAt: number;
}

export async function addToLibrary(
  db: SupabaseClient,
  userId: string,
  id: string,
  styleDna: StyleDNA
): Promise<LibraryItem> {
  const row = { id, user_id: userId, style_dna: styleDna, created_at: Date.now() };
  const { error } = await db.from("library_items").upsert(row);
  if (error) throw new Error(error.message);
  return { id, styleDna, createdAt: row.created_at };
}

export async function getLibrary(db: SupabaseClient): Promise<LibraryItem[]> {
  const { data, error } = await db
    .from("library_items")
    .select("id, style_dna, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    styleDna: r.style_dna as StyleDNA,
    createdAt: r.created_at,
  }));
}

export async function getLibraryItem(
  db: SupabaseClient,
  id: string
): Promise<LibraryItem | null> {
  const { data, error } = await db
    .from("library_items")
    .select("id, style_dna, created_at")
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return { id: data.id, styleDna: data.style_dna as StyleDNA, createdAt: data.created_at };
}

export async function deleteLibraryItem(
  db: SupabaseClient,
  id: string
): Promise<boolean> {
  const { error, count } = await db
    .from("library_items")
    .delete({ count: "exact" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}
