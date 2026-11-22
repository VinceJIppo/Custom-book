/**
 * Usage credits (US dollars).
 *
 * - Every new account starts with CREDIT_SIGNUP_USD; every printed book bought
 *   adds CREDIT_PER_BOOK_USD; parents can buy packs any time.
 * - Every Claude and Gemini call is charged at its actual recorded cost.
 * - Each grant is a lot that expires CREDIT_EXPIRY_MONTHS after it's added.
 *   Usage draws from the lot that expires soonest.
 * - Usage that runs past the balance (a job already in flight) becomes a
 *   "deficit" lot, paid off by the next grant. New work is blocked while the
 *   balance can't cover its estimate. Admins are charged but never blocked.
 * - At checkout, credits can pay toward a book as long as CREDIT_REDEEM_KEEP_USD stays.
 */
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { getConfig } from "../config";
import { isAdminEmail } from "../admin";
import { log } from "../log";

type Tx = Prisma.TransactionClient;
const DEFICIT_EXPIRY = new Date("9999-12-31T00:00:00Z");
const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function creditsEnabled() {
  return getConfig().CREDITS_ENABLED;
}

export function expiryFrom(date: Date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + getConfig().CREDIT_EXPIRY_MONTHS);
  return d;
}

export function creditPacks(): number[] {
  return getConfig()
    .CREDIT_PACKS_USD.split(",")
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 1 && n <= 500);
}

/**
 * Adds a lot. Idempotent per sourceKey. Pays off any deficit first.
 * Returns false when this grant was already made.
 */
export async function grantCredits(
  userId: string,
  amountUsd: number,
  kind: "signup" | "order" | "purchase" | "admin" | "refund",
  opts: { sourceKey?: string; note?: string; orderId?: string } = {},
  tx?: Tx,
): Promise<boolean> {
  const run = async (t: Tx) => {
    if (opts.sourceKey && (await t.creditLot.findUnique({ where: { sourceKey: opts.sourceKey } }))) return false;
    let left = round(amountUsd);
    const deficit = await t.creditLot.findFirst({ where: { userId, kind: "deficit", remainingUsd: { lt: 0 } } });
    if (deficit) {
      const pay = Math.min(left, -deficit.remainingUsd);
      await t.creditLot.update({ where: { id: deficit.id }, data: { remainingUsd: round(deficit.remainingUsd + pay) } });
      left = round(left - pay);
    }
    await t.creditLot.create({ data: { userId, kind, amountUsd: round(amountUsd), remainingUsd: left, expiresAt: expiryFrom(new Date()), sourceKey: opts.sourceKey, note: opts.note } });
    await t.creditEntry.create({ data: { userId, kind: "grant", amountUsd: round(amountUsd), orderId: opts.orderId, note: opts.note ?? kind } });
    return true;
  };
  return tx ? run(tx) : db.$transaction(run);
}

/** Every account gets its starting credits once (also for accounts made before credits existed). */
export async function ensureSignupCredits(userId: string) {
  if (!creditsEnabled()) return;
  const amount = getConfig().CREDIT_SIGNUP_USD;
  if (amount <= 0) return;
  try {
    await grantCredits(userId, amount, "signup", { sourceKey: `signup:${userId}`, note: "Welcome credits" });
  } catch (err) {
    // Two requests at once: the unique sourceKey lets only one through.
    if (!/Unique constraint/i.test(String(err))) throw err;
  }
}

/** Records lots that have expired since the last look (once each), so history shows them. */
async function settleExpired(userId: string, now = new Date()) {
  const expired = await db.creditLot.findMany({ where: { userId, kind: { not: "deficit" }, expiresAt: { lte: now }, remainingUsd: { gt: 0 } } });
  for (const lot of expired) {
    const r = await db.creditLot.updateMany({ where: { id: lot.id, remainingUsd: lot.remainingUsd }, data: { remainingUsd: 0 } });
    if (r.count) await db.creditEntry.create({ data: { userId, kind: "expire", amountUsd: -lot.remainingUsd, note: `Credits from ${lot.createdAt.toISOString().slice(0, 10)} expired` } });
  }
}

export interface CreditSummary {
  enabled: boolean;
  balanceUsd: number;
  /** Lots with money left, soonest to expire first. */
  lots: Array<{ id: string; kind: string; remainingUsd: number; amountUsd: number; expiresAt: Date; createdAt: Date }>;
  /** Credits expiring within 30 days. */
  expiringSoonUsd: number;
  nextExpiry: Date | null;
  /** The most that can go toward a book at checkout right now. */
  redeemableUsd: number;
}

export async function getCredits(userId: string): Promise<CreditSummary> {
  if (!creditsEnabled()) return { enabled: false, balanceUsd: 0, lots: [], expiringSoonUsd: 0, nextExpiry: null, redeemableUsd: 0 };
  await ensureSignupCredits(userId);
  const now = new Date();
  await settleExpired(userId, now);
  const lots = await db.creditLot.findMany({ where: { userId, OR: [{ remainingUsd: { not: 0 } }], expiresAt: { gt: now } }, orderBy: { expiresAt: "asc" } });
  const balanceUsd = round(lots.reduce((s, l) => s + l.remainingUsd, 0));
  const soon = new Date(now.getTime() + 30 * 86400_000);
  const positive = lots.filter((l) => l.remainingUsd > 0);
  return {
    enabled: true,
    balanceUsd,
    lots: positive.map((l) => ({ id: l.id, kind: l.kind, remainingUsd: l.remainingUsd, amountUsd: l.amountUsd, expiresAt: l.expiresAt, createdAt: l.createdAt })),
    expiringSoonUsd: round(positive.filter((l) => l.expiresAt <= soon).reduce((s, l) => s + l.remainingUsd, 0)),
    nextExpiry: positive[0]?.expiresAt ?? null,
    redeemableUsd: Math.max(0, Math.floor((balanceUsd - getConfig().CREDIT_REDEEM_KEEP_USD) * 100) / 100),
  };
}

/** Takes an amount from the balance, soonest-expiring credits first; anything left over becomes a deficit. */
async function debit(t: Tx, userId: string, amountUsd: number, now = new Date()) {
  let left = round(amountUsd);
  const lots = await t.creditLot.findMany({ where: { userId, kind: { not: "deficit" }, remainingUsd: { gt: 0 }, expiresAt: { gt: now } }, orderBy: { expiresAt: "asc" } });
  for (const lot of lots) {
    if (left <= 0) break;
    const take = Math.min(left, lot.remainingUsd);
    await t.creditLot.update({ where: { id: lot.id }, data: { remainingUsd: round(lot.remainingUsd - take) } });
    left = round(left - take);
  }
  if (left > 0) {
    const deficit = await t.creditLot.findFirst({ where: { userId, kind: "deficit" } });
    if (deficit) await t.creditLot.update({ where: { id: deficit.id }, data: { remainingUsd: round(deficit.remainingUsd - left) } });
    else await t.creditLot.create({ data: { userId, kind: "deficit", amountUsd: 0, remainingUsd: -left, expiresAt: DEFICIT_EXPIRY, note: "Usage past the balance" } });
  }
}

/** Charges the actual cost of API calls (a finished or failed job, or an inline call). */
export async function chargeUsage(userId: string, costUsd: number, opts: { bookId?: string | null; jobId?: string; note: string }, tx?: Tx) {
  if (!creditsEnabled() || !(costUsd > 0)) return;
  // A brand-new account's welcome credits are in place before its first charge.
  if (!tx) await ensureSignupCredits(userId);
  const run = async (t: Tx) => {
    await debit(t, userId, costUsd);
    await t.creditEntry.create({ data: { userId, kind: "usage", amountUsd: -round(costUsd), bookId: opts.bookId ?? undefined, jobId: opts.jobId, note: opts.note } });
  };
  try {
    if (tx) await run(tx);
    else await db.$transaction(run);
  } catch (err) {
    // Never lose the work because of bookkeeping; the cost is still on the job row.
    log.error("Could not charge credits", { userId, costUsd, err: String(err) });
  }
}

/**
 * Null when the user can start work estimated at `estimateUsd`, else a friendly
 * message. Admins are never blocked.
 */
export async function creditProblem(userId: string, estimateUsd: number): Promise<string | null> {
  if (!creditsEnabled()) return null;
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || isAdminEmail(user.email)) return null;
  const { balanceUsd } = await getCredits(userId);
  const need = Math.max(estimateUsd, 0.01);
  if (balanceUsd >= need) return null;
  return balanceUsd <= 0
    ? "You're out of credits. Add credits on the Credits page to keep making books (every printed book you buy also adds credits)."
    : `This needs about $${need.toFixed(2)} of credits and you have $${balanceUsd.toFixed(2)}. Add credits on the Credits page to continue.`;
}

/** Takes credits applied at checkout once the order is paid (idempotent per order). */
export async function redeemForOrder(userId: string, orderId: string, cents: number, tx: Tx) {
  if (cents <= 0) return;
  if (await tx.creditEntry.findFirst({ where: { orderId, kind: "redeem" } })) return;
  await debit(tx, userId, cents / 100);
  await tx.creditEntry.create({ data: { userId, kind: "redeem", amountUsd: -cents / 100, orderId, note: "Used toward a printed book" } });
}

/** A paid book order: add the per-book credits (once per order). */
export async function rewardForOrder(userId: string, orderId: string, tx: Tx) {
  const amount = getConfig().CREDIT_PER_BOOK_USD;
  if (!creditsEnabled() || amount <= 0) return;
  await grantCredits(userId, amount, "order", { sourceKey: `order:${orderId}`, orderId, note: "Thanks for ordering a book" }, tx);
}

/** A refunded order: give back credits used on it, and take back the unspent part of its reward. */
export async function reverseOrderCredits(userId: string, orderId: string) {
  if (!creditsEnabled()) return;
  await db.$transaction(async (tx) => {
    const reward = await tx.creditLot.findUnique({ where: { sourceKey: `order:${orderId}` } });
    if (reward && reward.remainingUsd > 0) {
      await tx.creditLot.update({ where: { id: reward.id }, data: { remainingUsd: 0 } });
      await tx.creditEntry.create({ data: { userId, kind: "refund", amountUsd: -reward.remainingUsd, orderId, note: "Order refunded: book credits removed" } });
    }
    const used = await tx.creditEntry.findFirst({ where: { orderId, kind: "redeem" } });
    if (used) await grantCredits(userId, -used.amountUsd, "refund", { sourceKey: `refund:${orderId}`, orderId, note: "Order refunded: credits returned" }, tx);
  });
}

export async function creditHistory(userId: string, take = 60) {
  return db.creditEntry.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take });
}

/** Credits used by one book so far. */
export async function bookCreditUse(userId: string, bookId: string) {
  const r = await db.creditEntry.aggregate({ where: { userId, bookId, kind: "usage" }, _sum: { amountUsd: true } });
  return round(-(r._sum.amountUsd ?? 0));
}
