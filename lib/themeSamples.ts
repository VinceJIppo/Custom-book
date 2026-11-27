import fs from "node:fs";
import path from "node:path";
import { db } from "./db";
import { getStorage } from "./storage";

const SAMPLE_DIR = path.join(process.cwd(), "public", "theme-samples");

/**
 * Up to three sample pictures per theme, so parents can see what a theme looks like:
 * 1. pictures shipped in public/theme-samples/<slug>/ (made with `npm run theme-samples`);
 * 2. otherwise pictures from this parent's own finished books in that theme.
 */
export async function themeSamples(userId: string, themes: Array<{ id: string; slug: string }>): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  const needOwn: string[] = [];
  for (const t of themes) {
    const dir = path.join(SAMPLE_DIR, t.slug);
    const files = /^[a-z0-9-]+$/.test(t.slug) && fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort() : [];
    if (files.length) out[t.id] = files.slice(0, 3).map((f) => `/theme-samples/${t.slug}/${f}`);
    else needOwn.push(t.id);
  }
  if (needOwn.length) {
    const pages = await db.page.findMany({
      where: { kind: "story", imageKey: { not: null }, imageStatus: "ready", book: { userId, themeId: { in: needOwn }, status: "ready" } },
      orderBy: [{ bookId: "asc" }, { index: "asc" }],
      select: { imageKey: true, book: { select: { themeId: true } } },
      take: 200,
    });
    const storage = getStorage();
    for (const p of pages) {
      const list = (out[p.book.themeId] ??= []);
      if (list.length < 3 && p.imageKey && !p.imageKey.endsWith(".svg")) list.push(await storage.signedUrl(p.imageKey, 3600));
    }
  }
  return out;
}

/**
 * One picture per ready-made story for the story cards:
 * public/theme-samples/<slug>/stories/<storyId>.jpg (made with `npm run theme-samples`),
 * otherwise the theme's sample pictures in turn.
 */
export function storyPictures(slug: string, storyIds: string[], fallback: string[] = []): Record<string, string | null> {
  const dir = path.join(SAMPLE_DIR, slug, "stories");
  const ok = /^[a-z0-9-]+$/.test(slug);
  return Object.fromEntries(
    storyIds.map((id, i) => {
      const file = ok && /^[a-z0-9-]+$/.test(id) ? path.join(dir, `${id}.jpg`) : "";
      return [id, file && fs.existsSync(file) ? `/theme-samples/${slug}/stories/${id}.jpg` : (fallback[i % Math.max(1, fallback.length)] ?? null)];
    }),
  );
}
