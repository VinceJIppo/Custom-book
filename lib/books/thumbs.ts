import { db } from "../db";
import { getStorage } from "../storage";

const TTL = 3600;

/** A cover picture for each book (or its first painted page while the cover is on its way). */
export async function bookThumbs(books: Array<{ id: string; coverImageKey: string | null }>): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const missing = books.filter((b) => !b.coverImageKey).map((b) => b.id);
  const firstPages = missing.length
    ? await db.page.findMany({ where: { bookId: { in: missing }, kind: "story", imageKey: { not: null } }, orderBy: { index: "asc" }, select: { bookId: true, imageKey: true } })
    : [];
  const storage = getStorage();
  for (const b of books) {
    const key = b.coverImageKey ?? firstPages.find((p) => p.bookId === b.id)?.imageKey;
    if (key) out[b.id] = await storage.signedUrl(key, TTL);
  }
  return out;
}

/** Each person's approved character picture, for round portraits. */
export async function portraits(profiles: Array<{ id: string; activeCharacterSheetId: string | null }>): Promise<Record<string, string>> {
  const ids = profiles.map((p) => p.activeCharacterSheetId).filter((x): x is string => !!x);
  if (!ids.length) return {};
  const sheets = await db.characterSheet.findMany({ where: { id: { in: ids }, selectedIndex: { not: null } }, select: { id: true, imageKeys: true, selectedIndex: true } });
  const storage = getStorage();
  const out: Record<string, string> = {};
  for (const p of profiles) {
    const s = sheets.find((x) => x.id === p.activeCharacterSheetId);
    const key = s ? (s.imageKeys as string[])[s.selectedIndex!] : null;
    if (key) out[p.id] = await storage.signedUrl(key, TTL);
  }
  return out;
}
