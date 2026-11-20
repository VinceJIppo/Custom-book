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
