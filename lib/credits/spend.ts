import type { Prisma } from "@prisma/client";
import { db } from "../db";
import type { Usage } from "../providers/types";
import { chargeUsage } from "./index";

/**
 * Records an API call made outside the job queue (moderation, photo checks,
 * text rewrites, theme drafts) as a finished job row, so it shows in cost
 * reports, and charges it to the user's credits.
 */
export async function recordInlineSpend(
  userId: string,
  type: string,
  usage: Usage,
  opts: { bookId?: string; pageId?: string; payload?: Prisma.InputJsonValue } = {},
  tx?: Prisma.TransactionClient,
) {
  const run = async (t: Prisma.TransactionClient) => {
    const job = await t.generationJob.create({
      data: {
        type,
        status: "succeeded",
        payload: opts.payload ?? {},
        userId,
        bookId: opts.bookId,
        pageId: opts.pageId,
        attempts: 1,
        provider: usage.provider,
        costUsd: usage.costUsd,
        usage: usage as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    await chargeUsage(userId, usage.costUsd, { bookId: opts.bookId, jobId: job.id, note: type }, t);
    return job;
  };
  return tx ? run(tx) : db.$transaction(run);
}
