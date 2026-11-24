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

/** Words that start many names but don't identify anyone ("Old Willa", "The Puffer Twins", "Mayor Fumbleflop"). */
const NAME_FILLERS = new Set(["the", "old", "little", "big", "young", "mr", "mrs", "ms", "miss", "sir", "lady", "lord", "dame", "uncle", "aunt", "auntie", "grandma", "grandpa", "professor", "doctor", "dr", "mayor", "captain", "king", "queen", "prince", "princess", "baby", "mama", "papa", "mister", "madam"]);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The words that identify a character: the full name, plus each distinctive word of it. */
export function nameKeys(name: string): string[] {
  const full = name.toLowerCase().trim();
  const words = full.split(/[^\p{L}'-]+/u).filter((w) => w.length >= 3 && !NAME_FILLERS.has(w));
  return [...new Set([full, ...words])];
}

/** True when the text mentions this character by name. */
export function mentions(text: string, name: string) {
  const hay = text.toLowerCase();
  return nameKeys(name).some((k) => new RegExp(`(^|[^\\p{L}])${escapeRe(k)}($|[^\\p{L}])`, "u").test(hay));
}

/** The guide entries for characters named in a scene. */
export function guideFor(outline: Pick<Outline, "characters"> | null, names: string[], text = ""): CharacterGuide[] {
  const all = outline?.characters ?? [];
  const hay = `${names.join(" ")} ${text}`;
  return all.filter((c) => mentions(hay, c.name));
}

/**
 * The full character guide: what the story plan listed, plus anyone it left out
 * who has a known kind: the theme's own characters (from their descriptions) and
 * the child's pet. So every animal in the book has a stated kind.
 */
export function completeGuide(characters: CharacterGuide[], ctx: Pick<StoryContext, "theme" | "child" | "options">): CharacterGuide[] {
  const out = [...characters];
  const has = (name: string) => out.some((c) => mentions(c.name, name) || mentions(name, c.name));
  for (const c of ctx.theme.supportingCast) {
    if (has(c.name)) continue;
    // A theme description starts with what they are: "a tall grey goose with ..." -> "a tall grey goose".
    const species = c.look.split(/,| with | wearing | in a | who /i)[0].trim() || c.role;
    out.push({ name: c.name, species: species.slice(0, 120), look: c.look.slice(0, 300) });
  }
  const pet = ctx.child.petName;
  if (ctx.options.includePet && pet && !has(pet)) {
    out.push({ name: pet, species: `${ctx.child.petType ? `a ${ctx.child.petType}` : "the family pet"} (always this same kind of animal)`, look: "the same colors, size and markings on every page" });
  }
  return out.slice(0, 14);
}

/**
 * Writes each named character's kind into a scene's character list
 * ("Old Willa" becomes "Old Willa (a tall grey goose)"), so the picture
 * instructions themselves say what every animal is.
 */
export function withSpecies<T extends { characters: string[] }>(scene: T, guide: CharacterGuide[]): T {
  return {
    ...scene,
    characters: scene.characters.map((entry) => {
      const g = guide.find((c) => mentions(entry, c.name));
      if (!g) return entry;
      const kindWord = g.species.toLowerCase().split(/\s+/).filter((w) => w.length > 2).pop() ?? "";
      return kindWord && entry.toLowerCase().includes(kindWord) ? entry : `${entry} (${g.species})`;
    }),
  };
}

/** One line per character, for image prompts and the picture check. */
export function guideLines(guide: CharacterGuide[]): string[] {
  return guide.map((c) => `${c.name} is ${c.species} on every page (never any other kind of animal or creature): ${c.look}`);
}
