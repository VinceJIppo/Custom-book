import { z } from "zod";

/**
 * Forgiving text for notes and descriptions (editor notes, scene details,
 * story-spine fields): an over-long answer is trimmed at a word boundary
 * instead of failing the whole step. Printed text (page words, title,
 * dedication, blurb) stays strict, because there length really matters.
 */
export function note(max: number, min = 0) {
  const base = min > 0 ? z.string().min(min) : z.string();
  return base.transform((s) => {
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 3);
    const space = cut.lastIndexOf(" ");
    return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}...`;
  });
}

/** A list where extra items beyond `max` are dropped instead of failing. */
export function list<T extends z.ZodType>(item: T, max: number) {
  return z.array(item).transform((a) => a.slice(0, max));
}

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
  action: note(400, 3),
  characters: list(note(60, 1), 6),
  setting: note(240, 3),
  mood: note(80, 2),
  framing: note(80, 2),
  /** Concrete things the words on this page say that the picture must show (e.g. "the Mayor upside down, balancing on his teapot hat"). */
  mustShow: list(note(200, 2), 6).default([]),
  /** World state that must be visible on this page (e.g. "the whole town is upside down"). */
  continuity: note(300).default(""),
});
export type Scene = z.infer<typeof SceneSchema>;

export const OutlineBeatSchema = z.object({
  pageNumber: z.number().int().min(1),
  beat: note(80, 2),
  summary: note(400, 5),
  /** How this page follows from the previous one ("because...", "but...", "so..."). */
  causeFromPrevious: note(300).default(""),
  characters: list(note(60, 1), 6),
  /** What the world looks like on this page (carried into the picture). */
  visualState: note(300).default(""),
});

export const SetupPayoffSchema = z.object({
  item: note(120, 2),
  setUpOnPage: z.number().int().min(1),
  paysOffOnPage: z.number().int().min(1),
});

export const ContinuityFactSchema = z.object({
  fact: note(240, 3),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
});

/**
 * How one recurring character looks for the WHOLE book. Shared by the writer,
 * editor, illustrator and picture check so a fox stays the same fox and nobody
 * gains or loses glasses, hats or outfits between pages.
 */
export const CharacterGuideSchema = z.object({
  name: note(60, 1),
  /** Exactly what kind of being: "a five-year-old boy", "a small red fox", "a round silver robot". */
  species: note(120, 2),
  /** Fixed appearance: size, colors, clothes, accessories (and what they do NOT wear, e.g. "no glasses"). */
  look: note(300, 3),
});
export type CharacterGuide = z.infer<typeof CharacterGuideSchema>;

/**
 * How the story begins, planned by the setup agent after the spine: the hero's
 * everyday world, what they want, the "One day..." event that disrupts it, why
 * it matters to them, and the moment they decide to act. Pages 1 to
 * journeyStartsOnPage - 1 tell this; the adventure starts on journeyStartsOnPage.
 */
export const StorySetupSchema = z.object({
  /** Who the hero is and their everyday world before anything goes wrong (place, routine, people). */
  homeWorld: note(500, 10),
  /** What the hero loves or wants, shown in the opening so the problem means something. */
  heroWant: note(300, 5),
  /** What the hero will grow in or learn (empty when there's nothing to grow). */
  innerNeed: note(300).default(""),
  /** The "One day..." event that disrupts the everyday world, and what caused it. */
  incitingIncident: note(400, 10),
  /** Why this matters to THIS hero: what they'd lose, who is counting on them. */
  whyItMatters: note(400, 10),
  /** Why the hero (not a grown-up) has to go, and why the easy fix won't work. */
  whyTheHero: note(400, 10),
  /** The moment the hero chooses to act, in their own words or actions. */
  decision: note(300, 5),
  /** The first page of the adventure itself. */
  journeyStartsOnPage: z.number().int().min(2),
  /** Details shown in the opening that matter later (an object, a skill, a promise). */
  plants: list(note(200, 3), 5).default([]),
  /** The opening pages, 1 to journeyStartsOnPage - 1. */
  openingPages: z.array(OutlineBeatSchema).min(1).max(10),
});
export type StorySetup = z.infer<typeof StorySetupSchema>;

/**
 * The story spine: decided before any page is written so the story has a
 * cause-and-effect arc. New fields default so books made before this still parse.
 */
export const OutlineSchema = z.object({
  title: z.string().min(2).max(80),
  premise: note(300, 10),
  /** How this world works, stated so readers can follow (e.g. "the bell only rings when everyone laughs together"). */
  worldRule: note(400).default(""),
  /** What is wrong and WHY, in kid logic. */
  problem: note(400).default(""),
  /** What the hero wants. */
  goal: note(300).default(""),
  /** Attempts that fail for a clear reason before the one that works. */
  attempts: list(z.object({ attempt: note(300, 3), whyItFails: note(300, 3) }), 4).default([]),
  turningPoint: note(400).default(""),
  resolution: note(400).default(""),
  /** How the lesson is shown through what happens (empty when there is no lesson). */
  lessonShown: note(300).default(""),
  setups: list(SetupPayoffSchema, 8).default([]),
  continuity: list(ContinuityFactSchema, 10).default([]),
  /** Every recurring character's species and fixed look, kept identical on every page. */
  characters: list(CharacterGuideSchema, 10).default([]),
  endingEcho: note(300).default(""),
  pages: z.array(OutlineBeatSchema).min(4).max(30),
  /** How the story begins (added by the setup agent; books made before it have none). */
  setup: StorySetupSchema.optional(),
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

export const EditorIssueSchema = z.object({
  page: z.number().int().min(0),
  problem: note(400, 3),
  fix: note(400, 3),
  /** "major": confusing, contradictory or broken (worth a second editor pass). "minor": wording and rhythm polish. */
  severity: z.enum(["major", "minor"]).default("major"),
});
export type EditorIssue = z.infer<typeof EditorIssueSchema>;

export const EditorReportSchema = z.object({
  /** "pass" when the story already works as a whole. */
  verdict: z.enum(["pass", "revise"]),
  /** One or two sentences on how the story reads as a whole. */
  overall: note(600),
  issues: list(EditorIssueSchema, 12),
});
export type EditorReport = z.infer<typeof EditorReportSchema>;

export const StoryPagesResultSchema = z.object({
  pages: z.array(StoryPageSchema).min(4).max(30),
  dedication: z.string().min(2).max(300),
  backCoverBlurb: z.string().min(10).max(500),
  coverScene: SceneSchema,
  /** The whole story in a short paragraph, given to the illustrator for every page. */
  storySummary: note(1200).default(""),
  /** What the editor pass found (kept for Story Lab and debugging). */
  editorNotes: list(EditorReportSchema, 3).default([]),
});
export type StoryPagesResult = z.infer<typeof StoryPagesResultSchema>;

export const CharacterBibleSchema = z.object({
  hair: note(160, 2),
  eyes: note(80, 2),
  skinTone: note(80, 2),
  faceShape: note(80, 2),
  glasses: note(80),
  freckles: note(80),
  signatureOutfit: note(200, 2),
  otherDetails: note(240).default(""),
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
