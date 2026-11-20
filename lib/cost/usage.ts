import { db } from "../db";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Today's generation spend and books started, for the daily caps. */
export async function dailyUsage(userId: string) {
  const since = startOfToday();
  const [cost, books] = await Promise.all([
    db.generationJob.aggregate({ where: { userId, createdAt: { gte: since } }, _sum: { costUsd: true } }),
    db.book.count({ where: { userId, createdAt: { gte: since }, status: { not: "draft" } } }),
  ]);
  return { costUsd: cost._sum.costUsd ?? 0, books };
}
