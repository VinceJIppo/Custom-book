import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getStorage, keys } from "../storage";
import { ChildProfileInputSchema, ChildSnapshotSchema, GrownUpInputSchema, type ChildProfileInput, type GrownUpInput } from "../schemas/child";
import { checkFieldsForProtectedNames } from "../safety/protectedNames";
import { getModeration } from "../providers/registry";
import { log } from "../log";

export type FieldErrors = Record<string, string>;
export type SaveResult = { ok: true; id: string } | { ok: false; errors: FieldErrors; message?: string; suggestedThemeIds?: string[] };

/** Validate, moderate and check for protected names. Shared by create and update. */
export async function validateChildInput(raw: unknown): Promise<{ ok: true; data: ChildProfileInput } | Extract<SaveResult, { ok: false }>> {
  const parsed = ChildProfileInputSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const i of parsed.error.issues) errors[i.path.join(".")] ??= i.message;
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }
  const d = parsed.data;
  // Names (child, pet, friends) are never checked: a real child can be called Elsa.
  const protectedHit = checkFieldsForProtectedNames({
    "favorites.colors": d.favorites.colors,
    "favorites.animals": d.favorites.animals,
    "favorites.foods": d.favorites.foods,
    "favorites.activities": d.favorites.activities,
    petType: d.petType,
    lesson: d.lesson,
  });
  if (protectedHit) {
    return {
      ok: false,
      errors: { [protectedHit.field]: protectedHit.match.message },
      message: protectedHit.match.message,
      suggestedThemeIds: protectedHit.match.suggestedThemeIds,
    };
  }
  const freeText = [...Object.values(d.favorites).flat(), d.petType, d.lesson].filter(Boolean).join(". ");
  const mod = await getModeration().check(freeText);
  if (!mod.ok) return { ok: false, errors: {}, message: mod.message };
  return { ok: true, data: d };
}

function toRow(d: ChildProfileInput) {
  return {
    firstName: d.firstName,
    nickname: d.nickname ?? null,
    age: d.age,
    pronouns: d.pronouns,
    favorites: d.favorites as unknown as Prisma.InputJsonValue,
    petName: d.petName ?? null,
    petType: d.petType ?? null,
    friends: d.friends as unknown as Prisma.InputJsonValue,
    lesson: d.lesson ?? null,
  };
}

export async function createChild(userId: string, raw: unknown): Promise<SaveResult> {
  const v = await validateChildInput(raw);
  if (!v.ok) return v;
  const child = await db.childProfile.create({ data: { userId, ...toRow(v.data) } });
  return { ok: true, id: child.id };
}

export async function updateChild(userId: string, childId: string, raw: unknown): Promise<SaveResult> {
  const v = await validateChildInput(raw);
  if (!v.ok) return v;
  const res = await db.childProfile.updateMany({ where: { id: childId, userId, kind: "child" }, data: toRow(v.data) });
  if (res.count !== 1) return { ok: false, errors: {}, message: "Child not found." };
  return { ok: true, id: childId };
}

/** Grown-ups (parents, grandparents...) who can star in a child's book. */
export async function validateGrownUpInput(raw: unknown): Promise<{ ok: true; data: GrownUpInput } | Extract<SaveResult, { ok: false }>> {
  const parsed = GrownUpInputSchema.safeParse({ ...(raw as object), kind: "grownup" });
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const i of parsed.error.issues) errors[i.path.join(".")] ??= i.message;
    return { ok: false, errors, message: "Please fix the highlighted fields." };
  }
  const d = parsed.data;
  const hit = checkFieldsForProtectedNames({ about: d.about, look: d.look });
  if (hit) return { ok: false, errors: { [hit.field]: hit.match.message }, message: hit.match.message, suggestedThemeIds: hit.match.suggestedThemeIds };
  const text = [d.relationship, d.about, d.look].filter(Boolean).join(". ");
  const mod = await getModeration().check(text);
  if (!mod.ok) return { ok: false, errors: {}, message: mod.message };
  return { ok: true, data: d };
}

function grownUpRow(d: GrownUpInput) {
  return {
    kind: "grownup",
    firstName: d.firstName,
    nickname: d.nickname ?? null,
    relationship: d.relationship,
    pronouns: d.pronouns,
    about: d.about ?? null,
    look: d.look ?? null,
    age: 0,
    favorites: { colors: [], animals: [], foods: [], activities: [] } as unknown as Prisma.InputJsonValue,
    friends: [] as unknown as Prisma.InputJsonValue,
  };
}

export async function createGrownUp(userId: string, raw: unknown): Promise<SaveResult> {
  const v = await validateGrownUpInput(raw);
  if (!v.ok) return v;
  const p = await db.childProfile.create({ data: { userId, ...grownUpRow(v.data) } });
  return { ok: true, id: p.id };
}

export async function updateGrownUp(userId: string, id: string, raw: unknown): Promise<SaveResult> {
  const v = await validateGrownUpInput(raw);
  if (!v.ok) return v;
  const res = await db.childProfile.updateMany({ where: { id, userId, kind: "grownup" }, data: grownUpRow(v.data) });
  if (res.count !== 1) return { ok: false, errors: {}, message: "Person not found." };
  return { ok: true, id };
}

/** Everyone a book can include: the parent's children and grown-ups. */
export async function listPeople(userId: string) {
  return db.childProfile.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}

export async function getChild(userId: string, childId: string) {
  return db.childProfile.findFirst({ where: { id: childId, userId } });
}

export function childSnapshot(child: NonNullable<Awaited<ReturnType<typeof getChild>>>) {
  return ChildSnapshotSchema.parse({
    id: child.id,
    firstName: child.firstName,
    nickname: child.nickname ?? undefined,
    age: child.age,
    pronouns: child.pronouns,
    favorites: child.favorites,
    petName: child.petName ?? undefined,
    petType: child.petType ?? undefined,
    friends: child.friends,
    lesson: child.lesson ?? undefined,
  });
}

/**
 * "Delete this child and everything about them": stops their jobs, removes
 * every stored file under the child's prefix, then removes the DB rows
 * (photos, character sheets, books, pages and jobs cascade).
 * Paid print orders are kept as records: their link to the book is cleared
 * and their frozen PDFs (stored under the book's prefix) are deleted with it.
 */
export async function deleteChildEverything(userId: string, childId: string) {
  const child = await db.childProfile.findFirst({ where: { id: childId, userId }, select: { id: true } });
  if (!child) return { ok: false as const };
  const bookIds = (await db.book.findMany({ where: { childId }, select: { id: true } })).map((b) => b.id);
  await db.generationJob.updateMany({
    where: { bookId: { in: bookIds }, status: { in: ["queued", "running"] } },
    data: { status: "cancelled" },
  });
  const files = await getStorage().deletePrefix(keys.childPrefix(userId, childId));
  await db.$transaction([
    // Unpaid orders go; paid ones stay as records (their book link and frozen PDFs are removed).
    db.order.deleteMany({ where: { bookId: { in: bookIds }, status: { in: ["awaiting_payment", "expired", "payment_failed"] } } }),
    db.childProfile.delete({ where: { id: childId } }),
  ]);
  log.info("Deleted child and all data", { files, books: bookIds.length });
  return { ok: true as const, files, books: bookIds.length };
}
