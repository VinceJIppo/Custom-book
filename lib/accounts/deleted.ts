/**
 * What stays behind after a parent deletes their account, and how a new account
 * with the same email is recognised. Kept separate from the delete itself so the
 * allowance and credit code can use it without pulling in the whole delete.
 */
import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "../db";

/** Deleted accounts get an address that can never receive mail or sign in. */
export const DELETED_EMAIL_DOMAIN = "deleted.invalid";

export function deletedEmailFor(userId: string) {
  return `deleted-${userId}@${DELETED_EMAIL_DOMAIN}`;
}

export function isDeletedEmail(email: string) {
  return email.toLowerCase().endsWith(`@${DELETED_EMAIL_DOMAIN}`);
}

/** One-way hash of an email: lets us recognise the address later without keeping it. */
export function deletedEmailHash(email: string) {
  return crypto.createHash("sha256").update(`storystar:deleted-account:${email.trim().toLowerCase()}`).digest("hex");
}

/** Lifetime use counts (books, characters, ...) saved at deletion. */
export type UsageCounts = Partial<Record<string, number>>;

/** True when an earlier account with this email was deleted. */
export async function wasDeletedBefore(email: string) {
  return (await db.user.count({ where: { deletedEmailHash: deletedEmailHash(email), deletedAt: { not: null } } })) > 0;
}

/** Use by earlier, deleted accounts with this email, added up (so deleting and signing up again doesn't restart a free trial). */
export async function priorUsage(email: string): Promise<UsageCounts> {
  const rows = await db.user.findMany({ where: { deletedEmailHash: deletedEmailHash(email), deletedAt: { not: null } }, select: { deletedUsage: true } });
  const total: Record<string, number> = {};
  for (const r of rows) {
    const u = (r.deletedUsage ?? {}) as Prisma.JsonObject;
    for (const [k, v] of Object.entries(u)) if (typeof v === "number" && v > 0) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}
