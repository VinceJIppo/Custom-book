/**
 * Usage allowances and rewards. Making books and characters costs real money
 * (AI calls), so how much someone can make depends on how much they've bought:
 *
 *   Starter (no printed orders yet): one complete try of the whole flow, for life.
 *   Member  (1+ printed orders):     a monthly allowance (rolling 30 days).
 *   Star    (3+ printed orders):     a bigger monthly allowance.
 *
 * Admins are unlimited. Admins can also set a tier for someone (family, friends)
 * or grant bonus books, characters and redraws. Failed generations never count.
 * The daily cost cap (DAILY_COST_CAP_USD) still applies on top as a safety net.
 */
import { db } from "../db";
import { getConfig } from "../config";
import { isAdminEmail } from "../admin";

export const ALLOWANCE_ACTIONS = ["book", "character", "redraw", "rewrite", "theme"] as const;
export type AllowanceAction = (typeof ALLOWANCE_ACTIONS)[number];
export const TIER_IDS = ["starter", "member", "star"] as const;
export type TierId = (typeof TIER_IDS)[number];

export interface Tier {
  id: TierId;
  label: string;
  /** Printed orders needed to reach this tier. */
  minPaidOrders: number;
  /** "lifetime" counts everything ever made; "30d" is a rolling 30 days. */
  window: "lifetime" | "30d";
  limits: Record<AllowanceAction, number>;
  pitch: string;
}

export const TIERS: Record<TierId, Tier> = {
  starter: {
    id: "starter",
    label: "Starter",
    minPaidOrders: 0,
    window: "lifetime",
    limits: { book: 1, character: 4, redraw: 8, rewrite: 15, theme: 1 },
    pitch: "Your first book is on us to try: one book, a few character tries, and some edits.",
  },
  member: {
    id: "member",
    label: "Member",
    minPaidOrders: 1,
    window: "30d",
    limits: { book: 3, character: 8, redraw: 40, rewrite: 60, theme: 5 },
    pitch: "3 new books, 8 character sets and 40 picture redraws every month.",
  },
  star: {
    id: "star",
    label: "Star",
    minPaidOrders: 3,
    window: "30d",
    limits: { book: 8, character: 20, redraw: 120, rewrite: 200, theme: 15 },
    pitch: "8 new books, 20 character sets and 120 picture redraws every month.",
  },
};

export const ACTION_LABELS: Record<AllowanceAction, { one: string; many: string }> = {
  book: { one: "new book", many: "new books" },
  character: { one: "character set", many: "character sets" },
  redraw: { one: "picture redraw", many: "picture redraws" },
  rewrite: { one: "AI text rewrite", many: "AI text rewrites" },
  theme: { one: "custom theme", many: "custom themes" },
};

export interface Allowance {
  unlimited: boolean;
  tier: Tier;
  paidOrders: number;
  limits: Record<AllowanceAction, number>;
  used: Record<AllowanceAction, number>;
  remaining: Record<AllowanceAction, number>;
  /** The next tier and how many more printed orders reach it. */
  next: { tier: Tier; ordersNeeded: number } | null;
  /** When a rolling-window allowance frees up its oldest use (30d tiers only). */
  windowDays: number | null;
}

export function tierFor(paidOrders: number, override?: string | null): Tier {
  if (override && (TIER_IDS as readonly string[]).includes(override)) return TIERS[override as TierId];
  return [...TIER_IDS].reverse().map((id) => TIERS[id]).find((t) => paidOrders >= t.minPaidOrders) ?? TIERS.starter;
}

export function allowancesEnabled() {
  return getConfig().ALLOWANCES_ENABLED;
}

async function countUsage(userId: string, since: Date | null): Promise<Record<AllowanceAction, number>> {
  const created = since ? { gte: since } : undefined;
  const [book, character, edits, illustrateJobs, rewrite, theme] = await Promise.all([
    db.book.count({ where: { userId, status: { not: "failed" }, createdAt: created } }),
    db.characterSheet.count({ where: { child: { userId }, status: { not: "failed" }, createdAt: created } }),
    db.generationJob.count({ where: { userId, type: "page.edit", status: { not: "failed" }, createdAt: created } }),
    db.generationJob.findMany({ where: { userId, type: "page.illustrate", status: { not: "failed" }, createdAt: created }, select: { payload: true } }),
    db.generationJob.count({ where: { userId, type: "page.revise", createdAt: created } }),
    db.generationJob.count({ where: { userId, type: "theme.draft", createdAt: created } }),
  ]);
  const redraws = illustrateJobs.filter((j) => (j.payload as { redraw?: boolean }).redraw).length;
  return { book, character, redraw: edits + redraws, rewrite, theme };
}

export async function getAllowance(userId: string): Promise<Allowance> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const paidOrders = await db.order.count({ where: { userId, paidAt: { not: null }, status: { not: "refunded" } } });
  const tier = tierFor(paidOrders, user.tierOverride);
  const since = tier.window === "30d" ? new Date(Date.now() - 30 * 86400_000) : null;
  const used = await countUsage(userId, since);
  const limits = {
    ...tier.limits,
    book: tier.limits.book + user.bonusBooks,
    character: tier.limits.character + user.bonusCharacters,
    redraw: tier.limits.redraw + user.bonusRedraws,
  };
  const remaining = Object.fromEntries(ALLOWANCE_ACTIONS.map((a) => [a, Math.max(0, limits[a] - used[a])])) as Record<AllowanceAction, number>;
  const nextTier = TIER_IDS.map((id) => TIERS[id]).find((t) => t.minPaidOrders > tier.minPaidOrders) ?? null;
  return {
    unlimited: !allowancesEnabled() || isAdminEmail(user.email),
    tier,
    paidOrders,
    limits,
    used,
    remaining,
    next: nextTier && !user.tierOverride ? { tier: nextTier, ordersNeeded: Math.max(1, nextTier.minPaidOrders - paidOrders) } : null,
    windowDays: since ? 30 : null,
  };
}

/** Friendly "how to get more" line for a blocked action. */
export function unlockMessage(a: Allowance, action: AllowanceAction): string {
  const label = ACTION_LABELS[action];
  const limit = a.limits[action];
  const used = a.tier.window === "lifetime" ? `You've used the ${limit === 1 ? label.one : `${limit} ${label.many}`} included with your first try.` : `You've used this month's ${limit} ${label.many}.`;
  if (a.next) {
    const n = a.next.ordersNeeded;
    return `${used} Order ${n === 1 ? "a printed copy of one of your books" : `${n} more printed books`} to become a ${a.next.tier.label}: ${a.next.tier.pitch}`;
  }
  return `${used} More become available as the month goes on (your allowance counts the last 30 days).`;
}

/** Returns null when allowed, or a friendly message saying how to get more. */
export async function checkAllowance(userId: string, action: AllowanceAction, count = 1): Promise<string | null> {
  if (!allowancesEnabled()) return null;
  const a = await getAllowance(userId);
  if (a.unlimited || a.remaining[action] >= count) return null;
  return unlockMessage(a, action);
}
