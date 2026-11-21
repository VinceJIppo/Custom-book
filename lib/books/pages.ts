import type { Prisma } from "@prisma/client";
import { checkAllowance } from "../allowance";
import { db } from "../db";
import { enqueue } from "../jobs/queue";
import { getModeration, getStoryProvider } from "../providers/registry";
import { checkFieldsForProtectedNames } from "../safety/protectedNames";
import { STORY_LAYOUTS, TEXT_ZONES, type StoryLayout, type TextZone } from "../schemas/story";
import { storyContextFor } from "./context";
import { getConfig } from "../config";
import { dailyUsage } from "../cost/usage";
import { IMAGE_PRICES, PLANNING_IMAGE_PRICE } from "../cost/prices";
import { imageProviderChoice } from "../providers/registry";

/**
 * Single-page editing. Every change that alters a page first saves the current
 * state as a PageVersion, so any page can be restored. Nothing here touches
 * other pages or regenerates the book.
 */

export type EditResult = { ok: true } | { ok: false; message: string };

async function ownedPage(userId: string, pageId: string) {
  return db.page.findFirst({ where: { id: pageId, book: { userId } }, include: { book: true } });
}

/** Saves the page's current state as a version and bumps its version number. Returns the new version. */
export async function snapshotPage(pageId: string, note?: string, tx: Prisma.TransactionClient = db): Promise<number> {
  const page = await tx.page.findUniqueOrThrow({ where: { id: pageId } });
  await tx.pageVersion.create({
    data: {
      pageId,
      version: page.version,
      text: page.text,
      scene: page.scene ?? undefined,
      layout: page.layout,
      textZone: page.textZone,
      imageKey: page.imageKey,
      workingImageKey: page.workingImageKey,
      note: note?.slice(0, 300),
    },
  });
  const next = page.version + 1;
  await tx.page.update({ where: { id: pageId }, data: { version: next } });
  return next;
}

async function checkNote(note: string): Promise<string | null> {
  const hit = checkFieldsForProtectedNames({ note });
  if (hit) return hit.match.message;
  const mod = await getModeration().check(note);
  return mod.ok ? null : (mod.message ?? "Please rephrase that note.");
}

async function underBudget(userId: string, usd: number): Promise<string | null> {
  const cap = getConfig().DAILY_COST_CAP_USD;
  const today = await dailyUsage(userId);
  return today.costUsd + usd > cap ? `That would go over today's generation budget of $${cap.toFixed(2)}.` : null;
}

export async function updatePageText(userId: string, pageId: string, text: string): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page) return { ok: false, message: "Page not found." };
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return { ok: false, message: "The page needs some text." };
  if (clean.length > 900) return { ok: false, message: "That's a lot of words for one page. Keep it under 900 characters." };
  const problem = await checkNote(clean);
  if (problem) return { ok: false, message: problem };
  await db.$transaction(async (tx) => {
    await snapshotPage(page.id, "Text edited", tx);
    await tx.page.update({ where: { id: page.id }, data: { text: clean } });
  });
  return { ok: true };
}

/** Ask the story model to rewrite one page's text. Runs inline: it takes a few seconds. */
export async function reviseTextWithAI(userId: string, pageId: string, instruction: string): Promise<EditResult & { text?: string }> {
  const page = await ownedPage(userId, pageId);
  if (!page || page.kind !== "story") return { ok: false, message: "Page not found." };
  const note = instruction.trim().slice(0, 300);
  if (!note) return { ok: false, message: "Tell us what to change." };
  const problem = await checkNote(note);
  if (problem) return { ok: false, message: problem };
  const overLimit = await checkAllowance(userId, "rewrite");
  if (overLimit) return { ok: false, message: overLimit };
  const budget = await underBudget(userId, 0.05);
  if (budget) return { ok: false, message: budget };
  const ctx = storyContextFor(page.book);
  const res = await getStoryProvider().reviseText({ text: page.text, scene: (page.scene as never) ?? null }, note, ctx);
  await db.$transaction(async (tx) => {
    await snapshotPage(page.id, `Text revised: ${note}`, tx);
    await tx.page.update({ where: { id: page.id }, data: { text: res.value.text } });
    // Record the spend against the book like any other generation.
    await tx.generationJob.create({
      data: {
        type: "page.revise",
        status: "succeeded",
        payload: { pageId: page.id, note },
        userId,
        bookId: page.bookId,
        pageId: page.id,
        attempts: 1,
        provider: res.usage.provider,
        costUsd: res.usage.costUsd,
        usage: res.usage as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
  });
  return { ok: true, text: res.value.text };
}

/**
 * Regenerate one illustration. mode "redraw" draws the scene again (optionally
 * with a note); mode "edit" changes the current picture per the note.
 */
export async function requestNewArt(userId: string, pageId: string, mode: "redraw" | "edit", note?: string): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page || page.kind !== "story") return { ok: false, message: "Only story pages have pictures to redraw." };
  const clean = note?.trim().slice(0, 300) || undefined;
  if (mode === "edit" && !clean) return { ok: false, message: "Tell us what to change in the picture." };
  if (mode === "edit" && !page.imageKey) return { ok: false, message: "This page has no picture yet. Use Redraw instead." };
  if (clean) {
    const problem = await checkNote(clean);
    if (problem) return { ok: false, message: problem };
  }
  const active = await db.generationJob.count({ where: { pageId, status: { in: ["queued", "running"] } } });
  if (active) return { ok: false, message: "This page is already being redrawn." };
  const overLimit = await checkAllowance(userId, "redraw");
  if (overLimit) return { ok: false, message: overLimit };
  const price = (IMAGE_PRICES[imageProviderChoice()] ?? PLANNING_IMAGE_PRICE).perIllustration * 2;
  const budget = await underBudget(userId, price);
  if (budget) return { ok: false, message: budget };

  await db.$transaction(async (tx) => {
    await tx.page.update({ where: { id: page.id }, data: { imageStatus: "pending" } });
    if (mode === "edit") await enqueue("page.edit", { pageId: page.id, note: clean }, { userId, bookId: page.bookId, pageId: page.id }, tx);
    else await enqueue("page.illustrate", { pageId: page.id, note: clean, redraw: true }, { userId, bookId: page.bookId, pageId: page.id }, tx);
  });
  return { ok: true };
}

export async function changeLayout(userId: string, pageId: string, layout: string, textZone: string): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page || page.kind !== "story") return { ok: false, message: "Only story pages can change layout." };
  if (!(STORY_LAYOUTS as readonly string[]).includes(layout)) return { ok: false, message: "Unknown layout." };
  if (!(TEXT_ZONES as readonly string[]).includes(textZone)) return { ok: false, message: "Unknown text position." };
  const zone: TextZone = layout === "imageTop" || layout === "textSpot" ? "bottom" : (textZone as TextZone);
  await db.$transaction(async (tx) => {
    await snapshotPage(page.id, `Layout: ${layout}`, tx);
    await tx.page.update({ where: { id: page.id }, data: { layout: layout as StoryLayout, textZone: zone } });
  });
  return { ok: true };
}

/** Move a story page one place earlier or later among the story pages. */
export async function movePage(userId: string, pageId: string, direction: "up" | "down"): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page || page.kind !== "story") return { ok: false, message: "Only story pages can be reordered." };
  const story = await db.page.findMany({ where: { bookId: page.bookId, kind: "story" }, orderBy: { index: "asc" } });
  const i = story.findIndex((p) => p.id === page.id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= story.length) return { ok: false, message: "That page can't move further." };
  const other = story[j];
  await db.$transaction([
    db.page.update({ where: { id: page.id }, data: { index: other.index, storyNumber: other.storyNumber } }),
    db.page.update({ where: { id: other.id }, data: { index: page.index, storyNumber: page.storyNumber } }),
  ]);
  return { ok: true };
}

export async function listVersions(userId: string, pageId: string) {
  const page = await ownedPage(userId, pageId);
  if (!page) return [];
  return db.pageVersion.findMany({ where: { pageId }, orderBy: { version: "desc" }, take: 20 });
}

export async function restoreVersion(userId: string, pageId: string, versionId: string): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page) return { ok: false, message: "Page not found." };
  const v = await db.pageVersion.findFirst({ where: { id: versionId, pageId } });
  if (!v) return { ok: false, message: "Version not found." };
  await db.$transaction(async (tx) => {
    await snapshotPage(page.id, `Restored version ${v.version}`, tx);
    await tx.page.update({
      where: { id: page.id },
      data: {
        text: v.text,
        scene: v.scene ?? undefined,
        layout: v.layout,
        textZone: v.textZone,
        imageKey: v.imageKey,
        workingImageKey: v.workingImageKey,
        imageStatus: v.imageKey ? "ready" : page.imageStatus,
      },
    });
  });
  return { ok: true };
}

/** Accept a flagged picture as-is (the parent decides the likeness is fine). */
export async function acceptFlagged(userId: string, pageId: string): Promise<EditResult> {
  const page = await ownedPage(userId, pageId);
  if (!page || page.imageStatus !== "flagged") return { ok: false, message: "Nothing to accept." };
  await db.page.update({ where: { id: page.id }, data: { imageStatus: "ready" } });
  return { ok: true };
}
