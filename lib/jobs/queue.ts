import type { GenerationJob, Prisma } from "@prisma/client";
import { db } from "../db";
import { errorMessage, log } from "../log";
import type { Usage } from "../providers/types";

/**
 * DB-backed job queue. Jobs survive restarts and page refreshes. Workers claim
 * a job with a conditional update so two workers never run the same job; a job
 * whose worker dies is reclaimed when its lease expires.
 */

export type JobType =
  | "book.outline"
  | "book.pages"
  | "page.illustrate"
  | "page.edit"
  | "page.revise"
  | "book.cover"
  | "book.finalize"
  | "character.sheet"
  | "character.bible"
  | "book.export"
  | "export.validate";

export interface EnqueueOptions {
  userId: string;
  childId?: string;
  bookId?: string;
  pageId?: string;
  maxAttempts?: number;
  runAfter?: Date;
}

export async function enqueue(type: JobType, payload: Prisma.InputJsonValue, opts: EnqueueOptions, tx: Prisma.TransactionClient = db) {
  return tx.generationJob.create({
    data: {
      type,
      payload,
      userId: opts.userId,
      childId: opts.childId,
      bookId: opts.bookId,
      pageId: opts.pageId,
      maxAttempts: opts.maxAttempts ?? 3,
      runAfter: opts.runAfter ?? new Date(),
    },
  });
}

/** Return jobs whose worker vanished to the queue. */
export async function reclaimExpired(now = new Date()) {
  const res = await db.generationJob.updateMany({
    where: { status: "running", lockedUntil: { lt: now } },
    data: { status: "queued", lockedBy: null, lockedUntil: null },
  });
  if (res.count) log.warn(`Reclaimed ${res.count} job(s) with expired leases`);
  return res.count;
}

export async function claimNext(workerId: string, leaseSeconds: number, types?: JobType[]): Promise<GenerationJob | null> {
  for (let tries = 0; tries < 5; tries++) {
    const now = new Date();
    const candidate = await db.generationJob.findFirst({
      where: { status: "queued", runAfter: { lte: now }, ...(types ? { type: { in: types } } : {}) },
      orderBy: [{ runAfter: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (!candidate) return null;
    const claimed = await db.generationJob.updateMany({
      where: { id: candidate.id, status: "queued" },
      data: {
        status: "running",
        lockedBy: workerId,
        lockedUntil: new Date(now.getTime() + leaseSeconds * 1000),
        attempts: { increment: 1 },
        startedAt: now,
      },
    });
    if (claimed.count === 1) return db.generationJob.findUnique({ where: { id: candidate.id } });
    // Another worker won the race; try the next one.
  }
  return null;
}

export async function complete(job: GenerationJob, result: Prisma.InputJsonValue | undefined, usage?: Usage) {
  await db.generationJob.update({
    where: { id: job.id },
    data: {
      status: "succeeded",
      result: result ?? undefined,
      provider: usage?.provider,
      costUsd: { increment: usage?.costUsd ?? 0 },
      usage: usage ? (usage as unknown as Prisma.InputJsonValue) : undefined,
      lockedBy: null,
      lockedUntil: null,
      finishedAt: new Date(),
      error: null,
    },
  });
}

/** Exponential backoff: 2s, 4s, 8s ... capped at 2 minutes. */
export function backoffMs(attempt: number) {
  return Math.min(120_000, 2000 * 2 ** Math.max(0, attempt - 1));
}

export async function fail(job: GenerationJob, err: unknown, opts: { permanent?: boolean; usage?: Usage } = {}) {
  const retry = !opts.permanent && job.attempts < job.maxAttempts;
  const msg = errorMessage(err);
  await db.generationJob.update({
    where: { id: job.id },
    data: {
      status: retry ? "queued" : "failed",
      error: msg,
      runAfter: retry ? new Date(Date.now() + backoffMs(job.attempts)) : undefined,
      costUsd: { increment: opts.usage?.costUsd ?? 0 },
      lockedBy: null,
      lockedUntil: null,
      finishedAt: retry ? null : new Date(),
    },
  });
  log.warn(`Job ${job.type} ${job.id} ${retry ? "will retry" : "failed"}: ${msg}`, { attempt: job.attempts });
  return retry;
}

/** Re-queue a failed job (from the UI "Retry" button). */
export async function retryJob(jobId: string, userId: string) {
  return db.generationJob.updateMany({
    where: { id: jobId, userId, status: "failed" },
    data: { status: "queued", attempts: 0, error: null, runAfter: new Date(), finishedAt: null },
  });
}
