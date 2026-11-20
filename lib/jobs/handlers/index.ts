import type { JobType } from "../queue";
import type { JobHandler } from "../types";
import { outlineHandler, pagesHandler } from "./story";
import { coverHandler, editHandler, illustrateHandler } from "./illustrate";
import { maybeFinalizeBook } from "./finalize";
import { bibleHandler, sheetHandler } from "./characters";

export const handlers: Record<JobType, JobHandler> = {
  "book.outline": outlineHandler,
  "book.pages": pagesHandler,
  "page.illustrate": illustrateHandler,
  "page.edit": editHandler,
  // Text revisions run inline and are only recorded as jobs for cost tracking.
  "page.revise": async () => ({}),
  "book.cover": coverHandler,
  "character.sheet": sheetHandler,
  "character.bible": bibleHandler,
  "book.finalize": async (job) => {
    if (job.bookId) await maybeFinalizeBook(job.bookId);
    return {};
  },
};
