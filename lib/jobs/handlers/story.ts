import type { GenerationJob, Prisma } from "@prisma/client";
import { db } from "../../db";
import { enqueue } from "../queue";
import { getStoryProvider } from "../../providers/registry";
import { outlineFor, storyContextFor } from "../../books/context";
import type { JobOutcome } from "../types";
import { PermanentProviderError } from "../../providers/types";

async function loadBook(job: GenerationJob) {
  if (!job.bookId) throw new PermanentProviderError("Job has no book");
  const book = await db.book.findUnique({ where: { id: job.bookId } });
  if (!book) throw new PermanentProviderError("Book no longer exists");
  return book;
}

export async function outlineHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const ctx = storyContextFor(book);
  const existing = outlineFor(book);
  let usage;
  if (!existing) {
    const res = await getStoryProvider().generateOutline(ctx);
    usage = res.usage;
    await db.book.update({ where: { id: book.id }, data: { outline: res.value as unknown as Prisma.InputJsonValue, title: res.value.title } });
  }
  await enqueue("book.pages", {}, { userId: book.userId, bookId: book.id });
  return { usage, result: { title: existing?.title ?? null } };
}

export async function pagesHandler(job: GenerationJob): Promise<JobOutcome> {
  const book = await loadBook(job);
  const ctx = storyContextFor(book);
  const outline = outlineFor(book);
  if (!outline) throw new PermanentProviderError("Book has no outline yet");

  const { value, usage } = await getStoryProvider().generatePages(outline, ctx);
  const dedication = ctx.options.dedication || value.dedication;
  const childName = ctx.child.nickname || ctx.child.firstName;

  await db.$transaction(async (tx) => {
    // Safe to re-run: replace any pages from an earlier partial attempt.
    await tx.page.deleteMany({ where: { bookId: book.id } });
    const rows: Prisma.PageCreateManyInput[] = [
      { bookId: book.id, index: 0, kind: "belongsTo", layout: "belongsTo", text: childName, textZone: "bottom" },
      { bookId: book.id, index: 1, kind: "dedication", layout: "dedication", text: dedication, textZone: "bottom" },
      { bookId: book.id, index: 2, kind: "title", layout: "title", text: book.title ?? outline.title, textZone: "top" },
      ...value.pages.map((p, i) => ({
        bookId: book.id,
        index: 3 + i,
        kind: "story",
        storyNumber: p.pageNumber,
        text: p.text,
        scene: p.scene as unknown as Prisma.InputJsonValue,
        layout: p.layout,
        textZone: p.textZone,
        imageStatus: "pending",
      })),
      { bookId: book.id, index: 3 + value.pages.length, kind: "theEnd", layout: "theEnd", text: "The End", textZone: "bottom" },
    ];
    await tx.page.createMany({ data: rows });
    await tx.book.update({
      where: { id: book.id },
      data: {
        dedication,
        backBlurb: value.backCoverBlurb,
        outline: { ...outline, coverScene: value.coverScene } as unknown as Prisma.InputJsonValue,
      },
    });
    const storyPages = await tx.page.findMany({ where: { bookId: book.id, kind: "story" }, select: { id: true } });
    for (const p of storyPages) {
      await enqueue("page.illustrate", { pageId: p.id }, { userId: book.userId, bookId: book.id, pageId: p.id }, tx);
    }
    await enqueue("book.cover", {}, { userId: book.userId, bookId: book.id }, tx);
  });
  return { usage, result: { pages: value.pages.length } };
}
