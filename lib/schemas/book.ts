import { z } from "zod";
import { ArtStyleSchema } from "./theme";
import { VoiceIdSchema } from "./voices";

export const STORY_LENGTHS = [12, 16, 20, 24] as const;
export type StoryLength = (typeof STORY_LENGTHS)[number];
export const READING_LEVELS = ["2-4", "4-6", "6-8"] as const;
export const ReadingLevelSchema = z.enum(READING_LEVELS);
export type ReadingLevel = z.infer<typeof ReadingLevelSchema>;

export const READING_LEVEL_RULES: Record<ReadingLevel, { label: string; rule: string; sentences: [number, number] }> = {
  "2-4": { label: "Ages 2 to 4", rule: "One short, simple sentence per page (about 5 to 12 words).", sentences: [1, 1] },
  "4-6": { label: "Ages 4 to 6", rule: "Two or three short sentences per page.", sentences: [2, 3] },
  "6-8": { label: "Ages 6 to 8", rule: "A short paragraph per page (three to five sentences).", sentences: [3, 5] },
};

export function readingLevelForAge(age: number): ReadingLevel {
  if (age < 4) return "2-4";
  if (age < 6) return "4-6";
  return "6-8";
}

export const TrimSizeSchema = z.enum(["square-8.5", "portrait-8.5x11", "portrait-8x10"]);
/** Sizes offered for new books (each has a print product). */
export const OFFERED_TRIM_SIZES = ["square-8.5", "portrait-8.5x11"] as const;
export type TrimSizeId = z.infer<typeof TrimSizeSchema>;

export const BookOptionsSchema = z.object({
  length: z.coerce
    .number()
    .int()
    .refine((n): n is StoryLength => (STORY_LENGTHS as readonly number[]).includes(n), "Story length must be 12, 16, 20 or 24 pages"),
  readingLevel: ReadingLevelSchema,
  style: ArtStyleSchema,
  /** Story voice. Optional only so books made before voices existed still parse (they read as "classic"). */
  voice: VoiceIdSchema.optional(),
  trimSize: TrimSizeSchema,
  includePet: z.boolean(),
  includeFriend: z.boolean(),
  lesson: z.string().trim().max(120).optional(),
  dedication: z.string().trim().max(300).optional(),
  /** Free-text extra instructions from the parent. Moderated and checked for protected names. */
  instructions: z.string().trim().max(500).optional(),
});
export type BookOptions = z.infer<typeof BookOptionsSchema>;
