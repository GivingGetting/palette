import type { StyleDNA } from "@/lib/analyzer/schema";

export interface LibraryItem {
  id: string;
  name?: string;
  styleDna: StyleDNA;
  createdAt: number;
}

// Persist across hot reloads in dev
const g = globalThis as typeof globalThis & { __palette_library__?: LibraryItem[] };
if (!g.__palette_library__) g.__palette_library__ = [];
const items = g.__palette_library__;

export function addToLibrary(id: string, styleDna: StyleDNA): LibraryItem {
  const item: LibraryItem = { id, styleDna, createdAt: Date.now() };
  // Avoid duplicates
  const idx = items.findIndex((i) => i.id === id);
  if (idx >= 0) items[idx] = item;
  else items.unshift(item);
  return item;
}

export function getLibrary(): LibraryItem[] {
  return [...items];
}

export function getLibraryItem(id: string): LibraryItem | undefined {
  return items.find((i) => i.id === id);
}

export function deleteLibraryItem(id: string): boolean {
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return false;
  items.splice(idx, 1);
  return true;
}
