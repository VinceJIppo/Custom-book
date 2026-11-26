import type { GenerationJob, Prisma } from "@prisma/client";
import { db } from "../../db";
import { enqueue } from "../queue";
import { getConfig } from "../../config";
import { queuePictures } from "../../books/pictures";
import { getStoryProvider } from "../../providers/registry";
import { outlineFor, storyContextFor } from "../../books/context";
import { completeGuide, storyContextWithLooks } from "../../books/appearance";
import type { JobOutcome } from "../types";
import { PermanentProviderError, sumUsage, type Usage, type WithUsage } from "../../providers/types";
import { applySetup } from "../../books/setup";
import type { DraftCheckpoint, ManuscriptResult } from "../../providers/story/types";
import type { StoryPagesResult } from "../../schemas/story";
import { notifyStoryReady } from "../../books/notify";

async function loadBook(job: GenerationJob) {
  if (!job.bookId) throw new PermanentProviderError("Job has no book");
  const book = await db.book.findUnique({ where: { id: job.bookId } });
  if (!book) throw new PermanentProviderError("Book no longer exists");
  return book;
}

export async function outlineHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const ctx = await storyContextWithLooks(book, storyContextFor(book));
  let outline = outlineFor(book);
  const provider = getStoryProvider();
  const usages: Usage[] = [];
  if (!outline) {
    const res = await provider.generateOutline(ctx);
    usages.push(res.usage);
    // Every theme character and the pet get a stated kind of animal, even if the plan left them out.
    outline = { ...res.value, characters: completeGuide(res.value.characters, ctx) };
    // Saved before the setup step, so a retry doesn't plan the spine again.
    await db.book.update({ where: { id: book.id }, data: { outline: outline as unknown as Prisma.InputJsonValue, title: outline.title } });
  }
  if (!outline.setup) {
    // The setup agent plans the opening: the hero's world, what goes wrong, and why they set off.
    const res = await provider.planSetup(outline, ctx);
    usages.push(res.usage);
    outline = applySetup(outline, res.value);
    await db.book.update({ where: { id: book.id }, data: { outline: outline as unknown as Prisma.InputJsonValue } });
  }
  await enqueue("book.pages", {}, { userId: book.userId, bookId: book.id });
  return { usage: usages.length ? sumUsage(usages[0].provider, usages) : undefined, result: { title: outline.title } };
}

/** Merges fields into the book's stored outline JSON (progress and drafts live there while writing). */
async function patchOutline(bookId: string, patch: Record<string, unknown>) {
  const cur = await db.book.findUnique({ where: { id: bookId }, select: { outline: true } });
  await db.book.update({ where: { id: bookId }, data: { outline: { ...((cur?.outline ?? {}) as object), ...patch } as Prisma.InputJsonValue } });
}

export async function pagesHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const ctx = await storyContextWithLooks(book, storyContextFor(book));
  const outline = outlineFor(book);
  if (!outline) throw new PermanentProviderError("Book has no outline yet");
  const raw = (book.outline ?? {}) as { draft?: DraftCheckpoint | null };
  const review = getConfig().STORY_REVIEW;
  // Progress is saved after every stage, so a retry picks up where it stopped.
  const opts = {
    resume: raw.draft ?? null,
    save: (cp: DraftCheckpoint) => patchOutline(book.id, { draft: cp }),
    onStage: (stage: string) => patchOutline(book.id, { drafting: stage }),
  };
  const provider = getStoryProvider();
  // With story review on, picture plans wait until the parent approves the words.
  const result = review ? await provider.writeManuscript(outline, ctx, opts) : await provider.generatePages(outline, ctx, opts);
  const { value, usage } = result as WithUsage<ManuscriptResult & Partial<StoryPagesResult>>;
  const dedication = ctx.options.dedication || value.dedication;
  const childName = ctx.child.nickname || ctx.child.firstName;
  const planned = new Map((value.pages as Array<{ pageNumber: number; scene?: unknown; layout?: string; textZone?: string }>).map((p) => [p.pageNumber, p]));

  await db.$transaction(async (tx) => {
    // Safe to re-run: replace any pages from an earlier partial attempt.
    await tx.page.deleteMany({ where: { bookId: book.id } });
    const rows: Prisma.PageCreateManyInput[] = [
      { bookId: book.id, index: 0, kind: "belongsTo", layout: "belongsTo", text: childName, textZone: "bottom" },
      { bookId: book.id, index: 1, kind: "dedication", layout: "dedication", text: dedication, textZone: "bottom" },
      { bookId: book.id, index: 2, kind: "title", layout: "title", text: book.title ?? outline.title, textZone: "top" },
      ...value.pages.map((p, i) => {
        const plan = planned.get(p.pageNumber);
        return {
          bookId: book.id,
          index: 3 + i,
          kind: "story",
          storyNumber: p.pageNumber,
          text: p.text,
          // No picture plan yet in review mode: made after approval.
          scene: plan?.scene ? (plan.scene as Prisma.InputJsonValue) : undefined,
          layout: plan?.layout ?? "fullBleed",
          textZone: plan?.textZone ?? "bottom",
          imageStatus: "pending",
        };
      }),
      { bookId: book.id, index: 3 + value.pages.length, kind: "theEnd", layout: "theEnd", text: "The End", textZone: "bottom" },
    ];
    await tx.page.createMany({ data: rows });
    const cur = ((await tx.book.findUnique({ where: { id: book.id }, select: { outline: true } }))?.outline ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = { ...cur, editorNotes: value.editorNotes, draft: null, drafting: null };
    if (value.coverScene) {
      // The illustrator reads the summary before every page.
      // artText: the words the picture plans were made for, so later edits know to refresh them.
      Object.assign(next, { coverScene: value.coverScene, storySummary: value.storySummary, artText: Object.fromEntries(value.pages.map((p) => [p.pageNumber, p.text])) });
    }
    await tx.book.update({ where: { id: book.id }, data: { dedication, backBlurb: value.backCoverBlurb, outline: next as Prisma.InputJsonValue } });
    if (review) {
      // Stop here: the parent reads (and can edit) the words before any picture is paid for.
      await tx.book.update({ where: { id: book.id }, data: { status: "story_review" } });
    } else {
      await queuePictures(book, tx);
    }
  });
  if (review) await notifyStoryReady(book.id);
  return { usage, result: { pages: value.pages.length } };
}
