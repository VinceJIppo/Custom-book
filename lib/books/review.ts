/**
 * Changing the story while the parent reviews it, before any picture is drawn:
 * - rewrite the whole story from their notes (a fresh plan and manuscript);
 * - rewrite a range of pages from their notes (the rest stays as it is);
 * - undo the last change;
 * - when the words changed after the picture plans were made, refresh the
 *   plans (scenes, layouts, cover) before the pictures start.
 */
import { Prisma, type Book, type GenerationJob } from "@prisma/client";
import { db } from "../db";
import { enqueue } from "../jobs/queue";
import { checkAllowance } from "../allowance";
import { getStoryProvider } from "../providers/registry";
import { PermanentProviderError } from "../providers/types";
import { SceneSchema, StoryLayoutSchema, TextZoneSchema } from "../schemas/story";
import { storyContextFor, outlineFor } from "./context";
import { storyContextWithLooks } from "./appearance";
import { checkNote, restoreVersion, snapshotPage, underBudget } from "./pages";
import { queuePictures } from "./pictures";
import { recordInlineSpend } from "../credits/spend";
import type { JobOutcome } from "../jobs/types";

export type ReviewResult = { ok: true; message: string; undoTag?: string } | { ok: false; message: string };

async function reviewingBook(userId: string, bookId: string) {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, include: { pages: { orderBy: { index: "asc" } } } });
  if (!book) return { error: "Book not found." } as const;
  if (book.status !== "story_review") return { error: "The story can only be changed before the pictures start." } as const;
  return { book } as const;
}

async function recordSpend(tx: Prisma.TransactionClient, book: Book, note: string, usage: { provider: string; costUsd: number }) {
  // Counts as one AI rewrite against the parent's allowance, and its cost against the book and their credits.
  await recordInlineSpend(book.userId, "page.revise", usage, { bookId: book.id, payload: { note, scope: "story" } }, tx);
}

async function vetNote(userId: string, raw: string, usd: number): Promise<string | { error: string }> {
  const note = raw.trim().replace(/\s+/g, " ").slice(0, 600);
  if (!note) return { error: "Tell us what you'd like to change." };
  const problem = await checkNote(note, userId);
  if (problem) return { error: problem };
  const overLimit = await checkAllowance(userId, "rewrite");
  if (overLimit) return { error: overLimit };
  const budget = await underBudget(userId, usd);
  if (budget) return { error: budget };
  return note;
}

/** Starts the story over from the parent's notes: a new plan and manuscript, then back to review. */
export async function rewriteWholeStory(userId: string, bookId: string, instruction: string): Promise<ReviewResult> {
  const found = await reviewingBook(userId, bookId);
  if ("error" in found) return { ok: false, message: found.error! };
  const { book } = found;
  const note = await vetNote(userId, instruction, 0.6);
  if (typeof note !== "string") return { ok: false, message: note.error };
  const outline = book.outline as { storySummary?: string; premise?: string } | null;
  const options = {
    ...(book.options as object),
    storyFeedback: { note, previousTitle: book.title ?? undefined, previousSummary: (outline?.storySummary || outline?.premise || "").slice(0, 1500) || undefined },
  };
  await db.$transaction(async (tx) => {
    await tx.page.deleteMany({ where: { bookId: book.id } });
    await tx.book.update({ where: { id: book.id }, data: { status: "generating", outline: Prisma.DbNull, coverImageKey: null, options: options as Prisma.InputJsonValue } });
    await recordSpend(tx, book, `Whole story: ${note}`, { provider: getStoryProvider().name, costUsd: 0 });
    await enqueue("book.outline", {}, { userId: book.userId, bookId: book.id }, tx);
  });
  return { ok: true, message: "Writing a new version of the story..." };
}

/** Rewrites pages from..to from the parent's notes. The other pages stay exactly as they are. */
export async function rewritePageRange(userId: string, bookId: string, from: number, to: number, instruction: string): Promise<ReviewResult> {
  const found = await reviewingBook(userId, bookId);
  if ("error" in found) return { ok: false, message: found.error! };
  const { book } = found;
  const story = book.pages.filter((p) => p.kind === "story" && p.storyNumber != null);
  const lo = Math.max(1, Math.min(from, to));
  const hi = Math.min(story.length, Math.max(from, to));
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) return { ok: false, message: "Choose which pages to change." };
  const note = await vetNote(userId, instruction, 0.15);
  if (typeof note !== "string") return { ok: false, message: note.error };
  const outline = outlineFor(book);
  if (!outline) return { ok: false, message: "This story has no plan to work from. Rewrite the whole story instead." };
  const ctx = await storyContextWithLooks(book, storyContextFor(book));
  const target = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const res = await getStoryProvider().revisePages(
    outline,
    story.map((p) => ({ pageNumber: p.storyNumber!, text: p.text })),
    target,
    note,
    ctx,
  );
  const changed = res.value.pages.filter((p) => p.text.trim());
  if (!changed.length) return { ok: false, message: "The rewrite didn't change anything. Try describing the change differently." };
  const tag = `Story rewrite ${Date.now().toString(36)}`;
  await db.$transaction(async (tx) => {
    for (const c of changed) {
      const page = story.find((p) => p.storyNumber === c.pageNumber);
      if (!page) continue;
      await snapshotPage(page.id, `${tag}: ${note}`, tx);
      await tx.page.update({ where: { id: page.id }, data: { text: c.text } });
    }
    await recordSpend(tx, book, `Pages ${lo} to ${hi}: ${note}`, res.usage);
  });
  const which = changed.map((c) => c.pageNumber);
  return { ok: true, message: `Rewrote ${which.length === 1 ? `page ${which[0]}` : `pages ${which.join(", ")}`}.`, undoTag: tag };
}

/** Puts back every page the given rewrite changed. */
export async function undoRewrite(userId: string, bookId: string, tag: string): Promise<ReviewResult> {
  const found = await reviewingBook(userId, bookId);
  if ("error" in found) return { ok: false, message: found.error! };
  if (!/^Story rewrite [a-z0-9]+$/.test(tag)) return { ok: false, message: "Nothing to undo." };
  const versions = await db.pageVersion.findMany({ where: { page: { bookId }, note: { startsWith: `${tag}:` } } });
  if (!versions.length) return { ok: false, message: "Nothing to undo." };
  for (const v of versions) await restoreVersion(userId, v.pageId, v.id);
  return { ok: true, message: "Undone." };
}

/** True when the words changed after the picture plans were made. */
export function plansAreStale(book: Pick<Book, "outline">, pages: Array<{ storyNumber: number | null; text: string; kind: string; scene?: unknown }>) {
  // Picture plans are made after approval (or the words changed after they were made).
  if (pages.some((p) => p.kind === "story" && p.scene == null)) return true;
  const artText = (book.outline as { artText?: Record<string, string> } | null)?.artText;
  if (!artText) return false;
  return pages.some((p) => p.kind === "story" && p.storyNumber != null && artText[String(p.storyNumber)] !== p.text);
}

/** Job: refresh the picture plans for the edited words, then start the pictures. */
export async function artDirectHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId }, include: { pages: { orderBy: { index: "asc" } } } }) : null;
  if (!book) throw new PermanentProviderError("Book no longer exists");
  const outline = outlineFor(book);
  if (!outline) throw new PermanentProviderError("Book has no outline");
  const story = book.pages.filter((p) => p.kind === "story" && p.storyNumber != null);
  const ctx = await storyContextWithLooks(book, storyContextFor(book));
  const res = await getStoryProvider().directArt(
    outline,
    story.map((p) => {
      const scene = SceneSchema.safeParse(p.scene);
      const layout = StoryLayoutSchema.safeParse(p.layout);
      const zone = TextZoneSchema.safeParse(p.textZone);
      return { pageNumber: p.storyNumber!, text: p.text, scene: scene.success ? scene.data : undefined, layout: layout.success ? layout.data : undefined, textZone: zone.success ? zone.data : undefined };
    }),
    ctx,
  );
  await db.$transaction(async (tx) => {
    for (const plan of res.value.pages) {
      const page = story.find((p) => p.storyNumber === plan.pageNumber);
      if (page) await tx.page.update({ where: { id: page.id }, data: { scene: plan.scene as unknown as Prisma.InputJsonValue, layout: plan.layout, textZone: plan.textZone } });
    }
    await tx.book.update({
      where: { id: book.id },
      data: {
        outline: {
          ...(book.outline as object),
          coverScene: res.value.coverScene,
          storySummary: res.value.storySummary,
          artText: Object.fromEntries(story.map((p) => [p.storyNumber, p.text])),
        } as unknown as Prisma.InputJsonValue,
      },
    });
    await queuePictures(book, tx);
  });
  return { usage: res.usage, result: { pages: res.value.pages.length } };
}

/** If refreshing the plans fails, the pictures still start from the plans the book has. */
export async function artDirectGaveUp(job: GenerationJob) {
  const book = job.bookId ? await db.book.findUnique({ where: { id: job.bookId } }) : null;
  if (book) await queuePictures(book);
}
