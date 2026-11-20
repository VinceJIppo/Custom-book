import type { JobType } from "../queue";
import type { JobHandler } from "../types";
import { outlineHandler, pagesHandler } from "./story";
import { coverHandler, illustrateHandler } from "./illustrate";
import { maybeFinalizeBook } from "./finalize";

export const handlers: Record<JobType, JobHandler> = {
  "book.outline": outlineHandler,
  "book.pages": pagesHandler,
  "page.illustrate": illustrateHandler,
  "book.cover": coverHandler,
  "book.finalize": async (job) => {
    if (job.bookId) await maybeFinalizeBook(job.bookId);
    return {};
  },
};
