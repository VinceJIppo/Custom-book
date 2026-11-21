import type { JobType } from "../queue";
import type { JobHandler } from "../types";
import { outlineHandler, pagesHandler } from "./story";
import { coverHandler, editHandler, illustrateHandler } from "./illustrate";
import { maybeFinalizeBook } from "./finalize";
import { batchHandler, batchPollHandler } from "./batch";
import { bibleHandler, sheetHandler } from "./characters";
import { exportHandler, validateHandler } from "./export";
import { orderStatusHandler, orderSubmitHandler } from "./orders";

export const handlers: Record<JobType, JobHandler> = {
  "book.outline": outlineHandler,
  "book.pages": pagesHandler,
  "page.illustrate": illustrateHandler,
  "page.edit": editHandler,
  // Text revisions run inline and are only recorded as jobs for cost tracking.
  "page.revise": async () => ({}),
  "book.cover": coverHandler,
  "book.batch": batchHandler,
  "book.batch.poll": batchPollHandler,
  "character.sheet": sheetHandler,
  "book.export": exportHandler,
  "export.validate": validateHandler,
  "character.bible": bibleHandler,
  "order.submit": orderSubmitHandler,
  "order.status": orderStatusHandler,
  "book.finalize": async (job) => {
    if (job.bookId) await maybeFinalizeBook(job.bookId);
    return {};
  },
};
