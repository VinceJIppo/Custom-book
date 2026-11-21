import crypto from "node:crypto";
import type { GenerationJob } from "@prisma/client";
import {
  claimNext,
  complete,
  extendLease,
  fail,
  reclaimExpired,
  type JobType,
} from "./queue";
import { getConfig } from "../config";
import { handlers } from "./handlers";
import { errorMessage, log } from "../log";
import type { Usage } from "../providers/types";

export async function runJob(job: GenerationJob) {
  const handler = handlers[job.type as JobType];
  if (!handler) {
    await fail(job, new Error(`No handler for job type ${job.type}`), {
      permanent: true,
    });
    return;
  }
  const started = Date.now();
  // Heartbeat: long picture jobs must not outlive their lease, or another worker
  // would start a second (also billed) copy of the same picture.
  const lease = getConfig().JOB_LEASE_SECONDS;
  const beat = setInterval(
    () =>
      void extendLease(job, lease).catch((e) =>
        log.warn("Couldn't extend job lease", { err: errorMessage(e) }),
      ),
    Math.max(5, Math.floor(lease / 3)) * 1000,
  );
  beat.unref?.();
  try {
    const outcome = await handler(job);
    await complete(job, outcome.result, outcome.usage);
    log.info(`Job ${job.type} ${job.id} done in ${Date.now() - started}ms`);
  } catch (err) {
    const permanent = !!(err as { permanent?: boolean }).permanent;
    const usage = (err as { usage?: Usage }).usage;
    const willRetry = await fail(job, err, { permanent, usage });
    if (!willRetry) await onJobGaveUp(job, err);
  } finally {
    clearInterval(beat);
  }
}

/** When a job fails for good, mark the related book or page so the UI can show it. */
async function onJobGaveUp(job: GenerationJob, _err: unknown) {
  const { db } = await import("../db");
  if (
    (job.type === "page.illustrate" || job.type === "page.edit") &&
    job.pageId
  ) {
    // A failed redraw or edit keeps the previous picture.
    await db.page.updateMany({
      where: { id: job.pageId, imageKey: { not: null } },
      data: { imageStatus: "ready" },
    });
    await db.page.updateMany({
      where: { id: job.pageId, imageKey: null },
      data: { imageStatus: "failed" },
    });
    const { maybeFinalizeBook } = await import("./handlers/finalize");
    if (job.bookId) await maybeFinalizeBook(job.bookId);
  } else if (
    job.bookId &&
    (job.type === "book.outline" || job.type === "book.pages")
  ) {
    await db.book.updateMany({
      where: { id: job.bookId },
      data: { status: "failed" },
    });
  } else if (job.type === "book.export" || job.type === "export.validate") {
    const { exportJobGaveUp } = await import("./handlers/export");
    await exportJobGaveUp(job, errorMessage(_err));
  } else if (job.type === "character.sheet") {
    const sheetId = (job.payload as { sheetId?: string }).sheetId;
    if (sheetId)
      await db.characterSheet.updateMany({
        where: { id: sheetId },
        data: { status: "failed", error: errorMessage(_err) },
      });
  } else if (job.type === "character.bible") {
    const sheetId = (job.payload as { sheetId?: string }).sheetId;
    if (sheetId)
      await db.characterSheet.updateMany({
        where: { id: sheetId, bibleStatus: "pending" },
        data: { bibleStatus: "failed" },
      });
  } else if (job.type === "order.submit") {
    const orderId = (job.payload as { orderId?: string }).orderId;
    const { submitGaveUp } = await import("../orders/service");
    if (orderId)
      await submitGaveUp(
        orderId,
        `Couldn't send the order to the printer: ${errorMessage(_err)}`,
      );
  } else if (job.type === "book.cover" && job.bookId) {
    const { maybeFinalizeBook } = await import("./handlers/finalize");
    await maybeFinalizeBook(job.bookId);
  }
}

/** Process jobs in this process until none are runnable. Used by tests and scripts. */
export async function drainQueue(
  opts: { workerId?: string; maxJobs?: number } = {},
) {
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
