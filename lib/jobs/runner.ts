import crypto from "node:crypto";
import type { GenerationJob } from "@prisma/client";
import { claimNext, complete, fail, reclaimExpired, type JobType } from "./queue";
import { handlers } from "./handlers";
import { log } from "../log";
import type { Usage } from "../providers/types";

export async function runJob(job: GenerationJob) {
  const handler = handlers[job.type as JobType];
  if (!handler) {
    await fail(job, new Error(`No handler for job type ${job.type}`), { permanent: true });
    return;
  }
  const started = Date.now();
  try {
    const outcome = await handler(job);
    await complete(job, outcome.result, outcome.usage);
    log.info(`Job ${job.type} ${job.id} done in ${Date.now() - started}ms`);
  } catch (err) {
    const permanent = !!(err as { permanent?: boolean }).permanent;
    const usage = (err as { usage?: Usage }).usage;
    const willRetry = await fail(job, err, { permanent, usage });
    if (!willRetry) await onJobGaveUp(job, err);
  }
}

/** When a job fails for good, mark the related book or page so the UI can show it. */
async function onJobGaveUp(job: GenerationJob, _err: unknown) {
  const { db } = await import("../db");
  if (job.type === "page.illustrate" && job.pageId) {
    await db.page.updateMany({ where: { id: job.pageId }, data: { imageStatus: "failed" } });
    const { maybeFinalizeBook } = await import("./handlers/finalize");
    if (job.bookId) await maybeFinalizeBook(job.bookId);
  } else if (job.bookId && (job.type === "book.outline" || job.type === "book.pages")) {
    await db.book.updateMany({ where: { id: job.bookId }, data: { status: "failed" } });
  } else if (job.type === "book.cover" && job.bookId) {
    const { maybeFinalizeBook } = await import("./handlers/finalize");
    await maybeFinalizeBook(job.bookId);
  }
}

/** Process jobs in this process until none are runnable. Used by tests and scripts. */
export async function drainQueue(opts: { workerId?: string; maxJobs?: number } = {}) {
  const workerId = opts.workerId ?? `inline-${crypto.randomUUID().slice(0, 8)}`;
  let n = 0;
  await reclaimExpired();
  for (;;) {
    if (opts.maxJobs && n >= opts.maxJobs) break;
    const job = await claimNext(workerId, 300);
    if (!job) break;
    await runJob(job);
    n++;
  }
  return n;
}
