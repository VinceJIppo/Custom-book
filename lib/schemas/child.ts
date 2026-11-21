import { z } from "zod";

export const PRONOUNS = ["he", "she", "they"] as const;
export const PronounsSchema = z.enum(PRONOUNS);
export type Pronouns = z.infer<typeof PronounsSchema>;

export const LESSONS = [
  "bravery",
  "sharing",
  "first day of school",
  "new sibling",
  "bedtime",
  "trying new foods",
] as const;

const shortList = z.array(z.string().trim().min(1).max(40)).max(8);

export const FavoritesSchema = z.object({
  colors: shortList.default([]),
  animals: shortList.default([]),
  foods: shortList.default([]),
  activities: shortList.default([]),
});
export type Favorites = z.infer<typeof FavoritesSchema>;

const nameField = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{M}' .-]+$/u, "Letters, spaces, apostrophes and dashes only");

export const PERSON_KINDS = ["child", "grownup"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

/** Who a grown-up is to the children, and what the story writer should know about them. */
export const GrownUpInputSchema = z.object({
  kind: z.literal("grownup"),
  firstName: nameField,
  nickname: nameField.optional(),
  relationship: z.string().trim().min(2, "Who are they to the children? For example Mom, Dad or Grandma.").max(40),
  pronouns: PronounsSchema,
  about: shortText(300),
  look: shortText(240),
});
export type GrownUpInput = z.infer<typeof GrownUpInputSchema>;

export const ChildProfileInputSchema = z.object({
  firstName: nameField,
  nickname: nameField.optional(),
  age: z.coerce.number().int().min(1).max(12),
  pronouns: PronounsSchema,
  favorites: FavoritesSchema,
  petName: nameField.optional(),
  petType: z.string().trim().min(1).max(40).optional(),
  friends: z.array(nameField).max(4).default([]),
  lesson: z.string().trim().min(2).max(120).optional(),
});
export type ChildProfileInput = z.infer<typeof ChildProfileInputSchema>;

/** The child details a book is generated from (frozen into Book.childSnapshot). */
export const ChildSnapshotSchema = ChildProfileInputSchema.extend({ id: z.string() });
export type ChildSnapshot = z.infer<typeof ChildSnapshotSchema>;

/** Another person in a book (a grown-up or another child), frozen onto the book. */
export const CastMemberSnapshotSchema = z.object({
  id: z.string(),
  kind: z.enum(PERSON_KINDS),
  name: z.string(),
  nickname: z.string().optional(),
  relationship: z.string().optional(),
  pronouns: PronounsSchema,
  age: z.number().int().optional(),
  about: z.string().optional(),
  look: z.string().optional(),
  /** What the parent wants their part in this story to be. */
  part: z.string().optional(),
  /** Approved character sheet in the book's style, if they have one. */
  characterSheetId: z.string().nullable().optional(),
});
export type CastMemberSnapshot = z.infer<typeof CastMemberSnapshotSchema>;
