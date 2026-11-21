import type { Prisma } from "@prisma/client";
import { checkAllowance } from "../allowance";
import { db } from "../db";
import { getConfig } from "../config";
import { enqueue } from "../jobs/queue";
import { BookOptionsSchema, type BookOptions } from "../schemas/book";
import { DEFAULT_VOICE } from "../schemas/voices";
import { getThemeForUser } from "../themes";
import { childSnapshot, getChild } from "../children/service";
import { checkFieldsForProtectedNames } from "../safety/protectedNames";
import { activeProviderNames, getModeration, imageProviderChoice } from "../providers/registry";
import { approvedSheetFor } from "../characters/service";
import { ART_STYLE_LABELS } from "../schemas/theme";
import { estimateBookCost } from "../cost/estimate";
import { dailyUsage } from "../cost/usage";

export type CreateBookResult =
  | { ok: true; bookId: string }
  | { ok: false; message: string; errors?: Record<string, string>; suggestedThemeIds?: string[] };

export function estimateFor(options: Pick<BookOptions, "length">) {
  const p = activeProviderNames();
  return estimateBookCost({ storyPages: options.length, storyProvider: p.story, storyModel: p.storyModel, imageProvider: p.image, upscaler: p.upscaler, vision: p.vision });
}

export { dailyUsage };

/** Validate everything, check caps, freeze the inputs onto the book, and queue the outline job. */
export async function createAndStartBook(userId: string, input: { childId: string; themeId: string; options: unknown }): Promise<CreateBookResult> {
  const parsed = BookOptionsSchema.safeParse(input.options);
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[i.path.join(".")] ??= i.message;
    return { ok: false, message: "Please check the book options.", errors };
  }
  // New books always record their voice; the default is the rhyming, mischievous one.
  const options = { ...parsed.data, voice: parsed.data.voice ?? DEFAULT_VOICE };
  const [child, theme] = await Promise.all([getChild(userId, input.childId), getThemeForUser(input.themeId, userId)]);
  if (!child) return { ok: false, message: "Child profile not found." };
  if (!theme) return { ok: false, message: "That theme is not available." };

  const character = await approvedSheetFor(child.id, options.style);
  if (!character && imageProviderChoice() !== "mock") {
    return {
      ok: false,
      message: `First create ${child.nickname || child.firstName}'s character in the ${ART_STYLE_LABELS[options.style]} style, so every page shows the same recognizable hero.`,
      errors: { style: "No approved character in this style yet" },
    };
  }

  const hit = checkFieldsForProtectedNames({ instructions: options.instructions, lesson: options.lesson, dedication: options.dedication });
  if (hit) {
    return { ok: false, message: hit.match.message, errors: { [hit.field]: hit.match.message }, suggestedThemeIds: hit.match.suggestedThemeIds };
  }
  const freeText = [options.instructions, options.lesson, options.dedication].filter(Boolean).join(". ");
  if (freeText) {
    const mod = await getModeration().check(freeText);
    if (!mod.ok) return { ok: false, message: mod.message ?? "Please rephrase." };
  }

  const overLimit = await checkAllowance(userId, "book");
  if (overLimit) return { ok: false, message: overLimit };
  const cfg = getConfig();
  const estimate = estimateFor(options);
  const today = await dailyUsage(userId);
  if (today.books >= cfg.DAILY_BOOK_CAP) {
    return { ok: false, message: `You've reached today's limit of ${cfg.DAILY_BOOK_CAP} books. Try again tomorrow.` };
  }
  if (today.costUsd + estimate.totalUsd > cfg.DAILY_COST_CAP_USD) {
    return { ok: false, message: `This book would go over today's generation budget of $${cfg.DAILY_COST_CAP_USD.toFixed(2)}. Try again tomorrow.` };
  }

  const book = await db.$transaction(async (tx) => {
    const b = await tx.book.create({
      data: {
        userId,
        childId: child.id,
        themeId: theme.id,
        characterSheetId: character?.sheet.id ?? null,
        themeSnapshot: theme.config as unknown as Prisma.InputJsonValue,
        childSnapshot: childSnapshot(child) as unknown as Prisma.InputJsonValue,
        style: options.style,
        trimSize: options.trimSize,
        options: options as unknown as Prisma.InputJsonValue,
        dedication: options.dedication ?? null,
        status: "generating",
        estimatedCostUsd: estimate.totalUsd,
      },
    });
    await enqueue("book.outline", {}, { userId, bookId: b.id }, tx);
    return b;
  });
  return { ok: true, bookId: book.id };
}

export async function getBookForUser(userId: string, bookId: string) {
  return db.book.findFirst({ where: { id: bookId, userId }, include: { pages: { orderBy: { index: "asc" } }, child: true } });
}

/** Re-queue the failed jobs of a book (the UI "Try again" button). */
export async function retryFailedJobs(userId: string, bookId: string) {
  const book = await db.book.findFirst({ where: { id: bookId, userId } });
  if (!book) return 0;
  const failed = await db.generationJob.count({ where: { bookId, status: "failed" } });
  if (!failed) return 0;
  await db.$transaction([
    db.generationJob.updateMany({
      where: { bookId, status: "failed" },
      data: { status: "queued", attempts: 0, error: null, runAfter: new Date(), finishedAt: null },
    }),
    db.page.updateMany({ where: { bookId, imageStatus: "failed" }, data: { imageStatus: "pending" } }),
    db.book.update({ where: { id: bookId }, data: { status: "generating" } }),
  ]);
  return failed;
}
