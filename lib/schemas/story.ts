import { z } from "zod";

/** Layouts a story page may use. Front/back matter layouts are fixed by page kind. */
export const STORY_LAYOUTS = ["fullBleed", "imageTop", "spread", "textSpot"] as const;
export const StoryLayoutSchema = z.enum(STORY_LAYOUTS);
export type StoryLayout = z.infer<typeof StoryLayoutSchema>;

export const ALL_LAYOUTS = [...STORY_LAYOUTS, "title", "dedication", "belongsTo", "theEnd", "endpaper", "drawYourOwn"] as const;
export type Layout = (typeof ALL_LAYOUTS)[number];

/** Where the layout places text. The illustration must leave clean space there. */
export const TEXT_ZONES = ["top", "bottom", "left", "right"] as const;
export const TextZoneSchema = z.enum(TEXT_ZONES);
export type TextZone = z.infer<typeof TextZoneSchema>;

export const SceneSchema = z.object({
  action: z.string().min(3).max(400),
  characters: z.array(z.string().min(1).max(60)).max(6),
  setting: z.string().min(3).max(240),
  mood: z.string().min(2).max(80),
  framing: z.string().min(2).max(80),
});
export type Scene = z.infer<typeof SceneSchema>;

export const OutlineBeatSchema = z.object({
  pageNumber: z.number().int().min(1),
  beat: z.string().min(2).max(80),
  summary: z.string().min(5).max(400),
  characters: z.array(z.string().min(1).max(60)).max(6),
});

export const OutlineSchema = z.object({
  title: z.string().min(2).max(80),
  premise: z.string().min(10).max(300),
  pages: z.array(OutlineBeatSchema).min(4).max(30),
});
export type Outline = z.infer<typeof OutlineSchema>;

export const StoryPageSchema = z.object({
  pageNumber: z.number().int().min(1),
  text: z.string().min(1).max(900),
  scene: SceneSchema,
  layout: StoryLayoutSchema,
  textZone: TextZoneSchema,
});
export type StoryPage = z.infer<typeof StoryPageSchema>;

export const StoryPagesResultSchema = z.object({
  pages: z.array(StoryPageSchema).min(4).max(30),
  dedication: z.string().min(2).max(300),
  backCoverBlurb: z.string().min(10).max(500),
  coverScene: SceneSchema,
});
export type StoryPagesResult = z.infer<typeof StoryPagesResultSchema>;

export const CharacterBibleSchema = z.object({
  hair: z.string().min(2).max(160),
  eyes: z.string().min(2).max(80),
  skinTone: z.string().min(2).max(80),
  faceShape: z.string().min(2).max(80),
  glasses: z.string().max(80),
  freckles: z.string().max(80),
  signatureOutfit: z.string().min(2).max(200),
  otherDetails: z.string().max(240).default(""),
});
export type CharacterBible = z.infer<typeof CharacterBibleSchema>;

/**
 * Checks a set of generated pages against the requested story length.
 * Returns plain-English problems (empty when valid). Used to trigger a retry.
 */
export function validateStoryPages(pages: StoryPage[], expected: number): string[] {
  const problems: string[] = [];
  if (pages.length !== expected) problems.push(`Expected exactly ${expected} pages but got ${pages.length}.`);
  const numbers = pages.map((p) => p.pageNumber).sort((a, b) => a - b);
  numbers.forEach((n, i) => {
    if (n !== i + 1) problems.push(`Page numbers must run 1..${expected} in order without gaps (found ${n} at position ${i + 1}).`);
  });
  const spreads = pages.filter((p) => p.layout === "spread").length;
  if (spreads > 2) problems.push(`At most 2 pages may use the "spread" layout (found ${spreads}).`);
  return [...new Set(problems)].slice(0, 5);
}
