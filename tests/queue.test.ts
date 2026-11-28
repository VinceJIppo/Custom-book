import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { backoffMs, claimNext, complete, enqueue, fail, reclaimExpired } from "@/lib/jobs/queue";
import { reclaimAbandonedJobs } from "@/lib/jobs/runner";
import { makeUser, resetDb } from "./helpers";

describe("job queue", () => {
  let userId: string;
  beforeEach(async () => {
    await resetDb();
    userId = (await makeUser()).id;
  });

  it("claims in order and never hands the same job to two workers", async () => {
    await enqueue("book.outline", { n: 1 }, { userId });
    await enqueue("book.outline", { n: 2 }, { userId });
    const [a, b, c] = await Promise.all([claimNext("w1", 60), claimNext("w2", 60), claimNext("w3", 60)]);
    const ids = [a, b, c].filter(Boolean).map((j) => j!.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect([a, b, c].filter(Boolean).every((j) => j!.status === "running" && j!.attempts === 1)).toBe(true);
  });

  it("retries with backoff, then fails for good", async () => {
    await enqueue("book.outline", {}, { userId, maxAttempts: 2 });
    let job = (await claimNext("w", 60))!;
    expect(await fail(job, new Error("flaky"))).toBe(true);
    let row = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("queued");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(await claimNext("w", 60)).toBeNull(); // not runnable until backoff passes
    await db.generationJob.update({ where: { id: job.id }, data: { runAfter: new Date(0) } });
    job = (await claimNext("w", 60))!;
    expect(await fail(job, new Error("still flaky"))).toBe(false);
    row = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row.status).toBe("failed");
    expect(row.error).toBe("still flaky");
  });

  it("does not retry permanent errors", async () => {
    await enqueue("book.outline", {}, { userId, maxAttempts: 5 });
    const job = (await claimNext("w", 60))!;
    expect(await fail(job, new Error("refused"), { permanent: true })).toBe(false);
  });

  it("records cost on completion", async () => {
    await enqueue("book.outline", {}, { userId });
    const job = (await claimNext("w", 60))!;
    await complete(job, { ok: true }, { provider: "anthropic", costUsd: 0.0123 });
    const row = await db.generationJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: "succeeded", provider: "anthropic", costUsd: 0.0123 });
  });

  it("reclaims jobs whose worker died", async () => {
    await enqueue("book.outline", {}, { userId });
    const job = (await claimNext("w", 60))!;
    await db.generationJob.update({ where: { id: job.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect(await reclaimExpired()).toBe(1);
    expect((await claimNext("w2", 60))?.id).toBe(job.id);
  });

  it("a job whose worker died on every try fails for good instead of looping forever", async () => {
    await enqueue("book.outline", {}, { userId, maxAttempts: 2 });
    await enqueue("book.outline", {}, { userId, maxAttempts: 2 });
    const first = (await claimNext("w", 60))!;
    const second = (await claimNext("w", 60))!;
    // The first has used both tries; the second still has one left.
    await db.generationJob.update({ where: { id: first.id }, data: { attempts: 2, lockedUntil: new Date(Date.now() - 1000) } });
    await db.generationJob.update({ where: { id: second.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    expect(await reclaimAbandonedJobs()).toEqual({ requeued: 1, failed: 1 });
    expect(await db.generationJob.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({ status: "failed", lockedBy: null });
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: first.id } })).error).toMatch(/worker stopped/);
    expect((await db.generationJob.findUniqueOrThrow({ where: { id: second.id } })).status).toBe("queued");
    // Nothing is left to pick up a third time.
    expect((await claimNext("w2", 60))?.id).toBe(second.id);
    expect(await claimNext("w3", 60)).toBeNull();
  });

  it("backoff grows and is capped", () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(2)).toBe(4000);
    expect(backoffMs(20)).toBe(120_000);
  });
});
