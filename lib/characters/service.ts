import { creditProblem } from "../credits";
import { moderate } from "../safety/moderate";
import { recordInlineSpend } from "../credits/spend";
import { Prisma } from "@prisma/client";
import { checkAllowance } from "../allowance";
import { db } from "../db";
import { getConfig } from "../config";
import { getStorage, keys } from "../storage";
import { enqueue } from "../jobs/queue";
import { normalizePhoto, PhotoProblem } from "../images/process";
import { getVisionProvider, imageProviderChoice } from "../providers/registry";
import { ArtStyleSchema, type ArtStyle } from "../schemas/theme";
import { CharacterBibleSchema, type CharacterBible } from "../schemas/story";
import { IMAGE_PRICES, PLANNING_IMAGE_PRICE } from "../cost/prices";
import { dailyUsage } from "../cost/usage";
import { checkFieldsForProtectedNames } from "../safety/protectedNames";
import { log } from "../log";

export const MAX_PHOTOS = 3;

export const PHOTO_TIPS = [
  "Just your child in the photo, facing the camera.",
  "Bright, even light (near a window works well). No strong shadows.",
  "Face fully visible: no sunglasses, hats pulled low, or hands over the face.",
  "A recent photo, in focus, with the face filling a good part of the frame.",
  "One close-up and one full-body photo give the best likeness.",
];

async function ownedChild(userId: string, childId: string) {
  return db.childProfile.findFirst({ where: { id: childId, userId } });
}

export type PhotoResult = { ok: true; photoId: string } | { ok: false; message: string; problems: string[] };

/**
 * Adds one photo: requires guardian consent, normalizes it (HEIC, rotation,
 * strips all metadata including GPS), checks for exactly one clear face, and
 * stores it encrypted. Photos that fail the check are never stored.
 */
export async function addPhoto(userId: string, childId: string, file: Buffer, consent: boolean): Promise<PhotoResult> {
  const child = await ownedChild(userId, childId);
  if (!child) return { ok: false, message: "Child not found.", problems: [] };
  if (!consent && !child.guardianConsentAt) {
    return { ok: false, message: "Please confirm you are this child's parent or legal guardian, or have their permission.", problems: [] };
  }
  const count = await db.childPhoto.count({ where: { childId } });
  if (count >= MAX_PHOTOS) return { ok: false, message: `You can upload up to ${MAX_PHOTOS} photos. Remove one first.`, problems: [] };

  let photo;
  try {
    photo = await normalizePhoto(file);
  } catch (err) {
    if (err instanceof PhotoProblem) return { ok: false, message: err.message, problems: [] };
    log.warn("Photo could not be read", { err });
    return { ok: false, message: "We couldn't read that file as a photo. Please try a JPG, PNG or HEIC.", problems: [] };
  }

  const check = await getVisionProvider().checkPhoto(photo);
  await recordInlineSpend(userId, "photo.check", check.usage, { payload: { childId } });
  if (!check.value.ok) {
    return { ok: false, message: "This photo won't give a good likeness.", problems: check.value.problems.length ? check.value.problems : ["Please try a clearer photo of just your child."] };
  }

  const row = await db.childPhoto.create({ data: { childId, storageKey: "pending", width: photo.width, height: photo.height, faces: check.value.faces } });
  const key = keys.photo(userId, childId, row.id);
  await getStorage().put(key, photo.data, photo.mimeType);
  await db.childPhoto.update({ where: { id: row.id }, data: { storageKey: key } });
  if (!child.guardianConsentAt) await db.childProfile.update({ where: { id: childId }, data: { guardianConsentAt: new Date() } });
  return { ok: true, photoId: row.id };
}

export async function deletePhoto(userId: string, photoId: string) {
  const photo = await db.childPhoto.findFirst({ where: { id: photoId, child: { userId } } });
  if (!photo) return false;
  await getStorage().delete(photo.storageKey);
  await db.childPhoto.delete({ where: { id: photo.id } });
  return true;
}

export async function deleteAllPhotos(childId: string) {
  const photos = await db.childPhoto.findMany({ where: { childId } });
  for (const p of photos) await getStorage().delete(p.storageKey);
  await db.childPhoto.deleteMany({ where: { childId } });
  return photos.length;
}

export function sheetOptionCost(count = getConfig().CHARACTER_SHEET_OPTIONS) {
  const p = IMAGE_PRICES[imageProviderChoice()] ?? PLANNING_IMAGE_PRICE;
  return Math.round(count * p.perSheetOption * 100) / 100;
}

export async function roundsUsed(childId: string, style: ArtStyle) {
  return db.characterSheet.count({ where: { childId, style, status: { not: "failed" } } });
}

export type StartSheetResult = { ok: true; sheetId: string } | { ok: false; message: string };

export async function startCharacterSheet(userId: string, childId: string, input: { style: string; outfit?: string }): Promise<StartSheetResult> {
  const child = await ownedChild(userId, childId);
  if (!child) return { ok: false, message: "Child not found." };
  const style = ArtStyleSchema.safeParse(input.style);
  if (!style.success) return { ok: false, message: "Please pick an art style." };
  const outfit = input.outfit?.trim().slice(0, 160) || undefined;
  if (outfit) {
    const hit = checkFieldsForProtectedNames({ outfit });
    if (hit) return { ok: false, message: hit.match.message };
    const mod = await moderate(outfit, { userId });
    if (!mod.ok) return { ok: false, message: mod.message ?? "Please describe the outfit differently." };
  }
  const photos = await db.childPhoto.count({ where: { childId } });
  if (photos === 0) return { ok: false, message: "Add at least one photo first." };

  const cfg = getConfig();
  const used = await roundsUsed(childId, style.data);
  if (used >= cfg.CHARACTER_SHEET_MAX_ROUNDS) {
    return { ok: false, message: `You've made ${used} sets of characters in this style, which is the limit. Pick one of the existing options, or try a different style.` };
  }
  const overLimit = await checkAllowance(userId, "character");
  if (!overLimit) {
    const credit = await creditProblem(userId, (IMAGE_PRICES[imageProviderChoice()] ?? PLANNING_IMAGE_PRICE).perIllustration * 3);
    if (credit) return { ok: false, message: credit };
  }
  if (overLimit) return { ok: false, message: overLimit };
  if (await db.characterSheet.count({ where: { childId, status: "generating" } })) {
    return { ok: false, message: "Characters are already being drawn. Give it a minute." };
  }
  const today = await dailyUsage(userId);
  if (today.costUsd + sheetOptionCost() > cfg.DAILY_COST_CAP_USD) {
    return { ok: false, message: `This would go over today's generation budget of $${cfg.DAILY_COST_CAP_USD.toFixed(2)}.` };
  }

  const sheet = await db.$transaction(async (tx) => {
    const s = await tx.characterSheet.create({
      data: { childId, style: style.data, outfit: outfit ?? null, round: used + 1, status: "generating", imageKeys: [] as unknown as Prisma.InputJsonValue },
    });
    await enqueue("character.sheet", { sheetId: s.id }, { userId, childId, maxAttempts: 2 }, tx);
    return s;
  });
  return { ok: true, sheetId: sheet.id };
}

/**
 * Approves one option: it becomes the child's character for this style, the
 * Character Bible is generated from it, and the original photos are deleted
 * when the parent has that option on (the default).
 */
export async function approveSheetOption(userId: string, sheetId: string, index: number) {
  const sheet = await db.characterSheet.findFirst({ where: { id: sheetId, child: { userId } }, include: { child: true } });
  if (!sheet || sheet.status !== "draft") return { ok: false as const, message: "That set of characters can't be approved." };
  const imageKeys = sheet.imageKeys as string[];
  if (!Number.isInteger(index) || index < 0 || index >= imageKeys.length) return { ok: false as const, message: "Pick one of the options." };

  await db.$transaction(async (tx) => {
    await tx.characterSheet.updateMany({ where: { childId: sheet.childId, style: sheet.style, status: "approved" }, data: { status: "rejected" } });
    await tx.characterSheet.update({ where: { id: sheet.id }, data: { status: "approved", selectedIndex: index, approvedAt: new Date(), bibleStatus: "pending" } });
    await tx.childProfile.update({ where: { id: sheet.childId }, data: { activeCharacterSheetId: sheet.id } });
    await enqueue("character.bible", { sheetId: sheet.id }, { userId, childId: sheet.childId }, tx);
  });
  // Unchosen options are no longer needed.
  for (const [i, key] of imageKeys.entries()) if (i !== index) await getStorage().delete(key);
  let deletedPhotos = 0;
  if (sheet.child.deleteOriginalsAfterApproval) deletedPhotos = await deleteAllPhotos(sheet.childId);
  return { ok: true as const, deletedPhotos };
}

/**
 * Deletes a character (an approved one, or a set of options not picked yet).
 * Its pictures are erased from storage right away. The record stays, marked
 * "deleted", so it still counts toward the character limits (deleting isn't a
 * way to get more tries). Books already made keep their pictures.
 */
export async function deleteCharacterSheet(userId: string, sheetId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const sheet = await db.characterSheet.findFirst({ where: { id: sheetId, child: { userId } }, include: { child: true } });
  if (!sheet || sheet.status === "deleted") return { ok: false, message: "That character was not found." };
  if (sheet.status === "generating") return { ok: false, message: "This character is still being drawn. Delete it once it's done." };
  const storage = getStorage();
  for (const key of sheet.imageKeys as string[]) await storage.delete(key).catch(() => undefined);
  await db.$transaction(async (tx) => {
    await tx.characterSheet.update({
      where: { id: sheet.id },
      data: { status: "deleted", imageKeys: [] as unknown as Prisma.InputJsonValue, selectedIndex: null, bible: Prisma.DbNull, bibleStatus: "none" },
    });
    await tx.generationJob.updateMany({ where: { type: "character.bible", status: "queued", childId: sheet.childId }, data: { status: "cancelled" } });
    if (sheet.child.activeCharacterSheetId === sheet.id) {
      // Fall back to the newest remaining approved character in another style, if any.
      const next = await tx.characterSheet.findFirst({ where: { childId: sheet.childId, status: "approved", id: { not: sheet.id } }, orderBy: { approvedAt: "desc" } });
      await tx.childProfile.update({ where: { id: sheet.childId }, data: { activeCharacterSheetId: next?.id ?? null } });
    }
  });
  return { ok: true };
}

export async function saveBible(userId: string, sheetId: string, raw: unknown) {
  const sheet = await db.characterSheet.findFirst({ where: { id: sheetId, child: { userId }, status: "approved" } });
  if (!sheet) return { ok: false as const, message: "Character not found." };
  const parsed = CharacterBibleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, message: "Please fill in every field (use \"none\" when a trait is absent)." };
  const text = Object.values(parsed.data).join(". ");
  const hit = checkFieldsForProtectedNames({ bible: text });
  if (hit) return { ok: false as const, message: hit.match.message };
  const mod = await moderate(text, { userId });
  if (!mod.ok) return { ok: false as const, message: mod.message ?? "Please rephrase." };
  await db.characterSheet.update({ where: { id: sheet.id }, data: { bible: parsed.data as unknown as Prisma.InputJsonValue, bibleStatus: "ready" } });
  return { ok: true as const };
}

export async function setDeleteOriginals(userId: string, childId: string, value: boolean) {
  await db.childProfile.updateMany({ where: { id: childId, userId }, data: { deleteOriginalsAfterApproval: value } });
}

/** The approved character for a child in a style, with its selected image key. */
export async function approvedSheetFor(childId: string, style: string) {
  const sheet = await db.characterSheet.findFirst({ where: { childId, style, status: "approved" }, orderBy: { approvedAt: "desc" } });
  if (!sheet || sheet.selectedIndex == null) return null;
  const key = (sheet.imageKeys as string[])[sheet.selectedIndex];
  const bible = sheet.bible ? CharacterBibleSchema.safeParse(sheet.bible) : null;
  return { sheet, imageKey: key, bible: bible?.success ? (bible.data as CharacterBible) : null };
}

export async function approvedStyles(childId: string): Promise<string[]> {
  const rows = await db.characterSheet.findMany({ where: { childId, status: "approved" }, select: { style: true } });
  return [...new Set(rows.map((r) => r.style))];
}
