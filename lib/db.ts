import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Enable WAL on SQLite so the web app and the worker can write concurrently. */
export async function tuneSqlite() {
  if (!(process.env.DATABASE_URL ?? "file:").startsWith("file:")) return;
  await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
  await db.$queryRawUnsafe("PRAGMA busy_timeout=5000;");
}
