/**
 * Who the story is for. The reading level (from the child's age) sets how many words
 * fit on a page; this sets what kind of story fits the listener: how simple the problem
 * is, how many characters and tries it carries, and which listener the editor and the
 * blind reader imagine when they check that it makes sense.
 */
import type { ReadingLevel } from "../schemas/book";

export interface Audience {
  /** The listener the checks imagine, e.g. "a five-year-old". */
  listener: string;
  /** How long the plan's say-it-back summary is. */
  summary: string;
  /** The fewest summary sentences the plan may have. */
  summaryMin: number;
  /** What a story for this age looks like, for the planner, writer and editor. */
  shape: string[];
  /** Tighter (or looser) limits than the page count alone gives; null = the page-count budget as is. */
  budget: { helpers?: number; realParts?: number; attempts?: [number, number] } | null;
}

export const AUDIENCES: Record<ReadingLevel, Audience> = {
  "2-4": {
    listener: "a three-year-old",
    summary: "three to five very short sentences",
    summaryMin: 3,
    shape: [
      "One small, familiar problem from a toddler's everyday world (something lost, someone sleepy, hungry, stuck or a little sad). No mystery, nothing to work out across pages.",
      "Repetition is the story's backbone: a short phrase or pattern the child can join in with on most pages, and always the same words for the same thing.",
      "Exactly one try that doesn't work, then the fix. The fix is something a toddler can see and do (a hug, sharing, looking underneath, saying sorry, a gentle push).",
      "Feelings in one plain word (happy, sad, sleepy, cross), and nothing even mildly worrying: the problem is cozy and solved quickly.",
      "Everyday words only. At most one simple rule of the world, said plainly the first time it matters.",
    ],
    budget: { helpers: 1, realParts: 1, attempts: [1, 1] },
  },
  "4-6": {
    listener: "a five-year-old",
    summary: "five to seven very short sentences",
    summaryMin: 4,
    shape: [
      "One clear problem with a reason a five-year-old can follow, said in the words (\"because...\", \"so...\").",
      "The hero tries, fails for a reason the listener can see, and tries again; the fix uses something set up earlier.",
      "Feelings are named simply and change over the story; humor is gentle and visual.",
    ],
    budget: null,
  },
  "6-8": {
    listener: "a seven-year-old",
    summary: "six to eight short sentences",
    summaryMin: 5,
    shape: [
      "The story can carry a little more: a small surprise or twist that was fairly set up earlier, or a problem with two parts, but still one clear goal.",
      "Two tries that fail for different reasons before the one that works, so the hero has to think, not just repeat.",
      "Show what the hero feels and how it changes (unsure at first, braver or wiser at the end) through choices and a little inner thought.",
      "Richer, playful words and some wordplay are welcome when the meaning is clear from context; dialogue can carry the story.",
      "Humor can be sillier and the stakes a little bigger, but never frightening.",
    ],
    budget: { attempts: [2, 2] },
  },
};

export function audienceFor(level: ReadingLevel): Audience {
  return AUDIENCES[level];
}

/** The audience as instructions for the planner, writer and editor. */
export function audienceText(level: ReadingLevel): string {
  const a = audienceFor(level);
  return [`WHO IT'S FOR: this book is read aloud to ${a.listener}. A story that fits this listener:`, ...a.shape.map((s) => `- ${s}`)].join("\n");
}
