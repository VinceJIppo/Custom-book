import type { Book } from "@prisma/client";
import { db } from "../db";
import { CharacterBibleSchema, type CharacterBible, type CharacterGuide, type Outline } from "../schemas/story";
import type { StoryContext } from "../providers/story/types";

/** A character sheet's fixed traits in one plain line, saying "no glasses" when there are none. */
export function appearanceText(b: CharacterBible): string {
  const glasses = !b.glasses || /^(none|no|n\/a)\.?$/i.test(b.glasses.trim()) ? "no glasses" : `glasses: ${b.glasses}`;
  return [`hair: ${b.hair}`, `eyes: ${b.eyes}`, `skin tone: ${b.skinTone}`, glasses, `outfit: ${b.signatureOutfit}`, b.otherDetails].filter(Boolean).join("; ");
}

async function bibleOf(sheetId: string | null | undefined) {
  if (!sheetId) return null;
  const sheet = await db.characterSheet.findUnique({ where: { id: sheetId }, select: { bible: true } });
  const parsed = sheet?.bible ? CharacterBibleSchema.safeParse(sheet.bible) : null;
  return parsed?.success ? parsed.data : null;
}

/** How the hero and the real people in the cast look, from their approved character sheets. */
export async function loadAppearance(book: Pick<Book, "characterSheetId">, ctx: StoryContext): Promise<StoryContext["appearance"]> {
  const hero = await bibleOf(book.characterSheetId);
  const people: Record<string, string> = {};
  for (const m of ctx.cast ?? []) {
    const b = await bibleOf(m.characterSheetId);
    const text = b ? appearanceText(b) : m.look;
    if (text) people[m.nickname || m.name] = text;
  }
  return { hero: hero ? appearanceText(hero) : undefined, people };
}

/** The story context with appearances filled in, for every story step. */
export async function storyContextWithLooks(book: Pick<Book, "characterSheetId">, ctx: StoryContext): Promise<StoryContext> {
  return { ...ctx, appearance: await loadAppearance(book, ctx) };
}

/** The guide entries for characters named in a scene (all recurring characters when none match). */
export function guideFor(outline: Pick<Outline, "characters"> | null, names: string[], text = ""): CharacterGuide[] {
  const all = outline?.characters ?? [];
  const hay = `${names.join(" ")} ${text}`.toLowerCase();
  const hit = all.filter((c) => {
    const first = c.name.toLowerCase().split(/\s+/)[0];
    return first.length > 1 && new RegExp(`(^|[^\\p{L}])${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u").test(hay);
  });
  return hit;
}

/** One line per character, for image prompts and the picture check. */
export function guideLines(guide: CharacterGuide[]): string[] {
  return guide.map((c) => `${c.name} is ${c.species}: ${c.look}`);
}
