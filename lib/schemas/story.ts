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
  /** Concrete things the words on this page say that the picture must show (e.g. "the Mayor upside down, balancing on his teapot hat"). */
  mustShow: z.array(z.string().min(2).max(200)).max(6).default([]),
  /** World state that must be visible on this page (e.g. "the whole town is upside down"). */
  continuity: z.string().max(300).default(""),
});
export type Scene = z.infer<typeof SceneSchema>;

export const OutlineBeatSchema = z.object({
  pageNumber: z.number().int().min(1),
  beat: z.string().min(2).max(80),
  summary: z.string().min(5).max(400),
  /** How this page follows from the previous one ("because...", "but...", "so..."). */
  causeFromPrevious: z.string().max(300).default(""),
  characters: z.array(z.string().min(1).max(60)).max(6),
  /** What the world looks like on this page (carried into the picture). */
  visualState: z.string().max(300).default(""),
});

export const SetupPayoffSchema = z.object({
  item: z.string().min(2).max(120),
  setUpOnPage: z.number().int().min(1),
  paysOffOnPage: z.number().int().min(1),
});

export const ContinuityFactSchema = z.object({
  fact: z.string().min(3).max(240),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
});

/**
 * The story spine: decided before any page is written so the story has a
 * cause-and-effect arc. New fields default so books made before this still parse.
 */
export const OutlineSchema = z.object({
  title: z.string().min(2).max(80),
  premise: z.string().min(10).max(300),
  /** How this world works, stated so readers can follow (e.g. "the bell only rings when everyone laughs together"). */
  worldRule: z.string().max(400).default(""),
  /** What is wrong and WHY, in kid logic. */
  problem: z.string().max(400).default(""),
  /** What the hero wants. */
  goal: z.string().max(300).default(""),
  /** Attempts that fail for a clear reason before the one that works. */
  attempts: z.array(z.object({ attempt: z.string().min(3).max(300), whyItFails: z.string().min(3).max(300) })).max(4).default([]),
  turningPoint: z.string().max(400).default(""),
  resolution: z.string().max(400).default(""),
  /** How the lesson is shown through what happens (empty when there is no lesson). */
  lessonShown: z.string().max(300).default(""),
  setups: z.array(SetupPayoffSchema).max(8).default([]),
  continuity: z.array(ContinuityFactSchema).max(10).default([]),
  endingEcho: z.string().max(300).default(""),
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

export const EditorIssueSchema = z.object({
  page: z.number().int().min(0),
  problem: z.string().min(3).max(400),
  fix: z.string().min(3).max(400),
});
export type EditorIssue = z.infer<typeof EditorIssueSchema>;

export const EditorReportSchema = z.object({
  /** "pass" when the story already works as a whole. */
  verdict: z.enum(["pass", "revise"]),
  /** One or two sentences on how the story reads as a whole. */
  overall: z.string().max(600),
  issues: z.array(EditorIssueSchema).max(12),
});
export type EditorReport = z.infer<typeof EditorReportSchema>;

export const StoryPagesResultSchema = z.object({
  pages: z.array(StoryPageSchema).min(4).max(30),
  dedication: z.string().min(2).max(300),
  backCoverBlurb: z.string().min(10).max(500),
  coverScene: SceneSchema,
  /** The whole story in a short paragraph, given to the illustrator for every page. */
  storySummary: z.string().max(1200).default(""),
  /** What the editor pass found (kept for Story Lab and debugging). */
  editorNotes: z.array(EditorReportSchema).max(3).default([]),
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
