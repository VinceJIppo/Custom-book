import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { getAllowance, TIER_IDS, TIERS } from "@/lib/allowance";
import { randomUUID } from "node:crypto";
import { creditsEnabled } from "@/lib/credits";
import { addCreditsAction, resetCharactersAction, saveRewardsAction } from "./actions";

export const dynamic = "force-dynamic";

/** Customers, their tier and usage, and rewards you can grant (family, friends, apologies). */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ saved?: string; credited?: string; error?: string; reset?: string }> }) {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
  const sp = await searchParams;
  const users = await db.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 200 });
  const rows = await Promise.all(users.map(async (u) => ({ u, a: await getAllowance(u.id) })));
  const credits = creditsEnabled();
  // Current balances, read directly (looking doesn't change anything).
  const lots = credits ? await db.creditLot.groupBy({ by: ["userId"], where: { userId: { in: users.map((u) => u.id) }, expiresAt: { gt: new Date() } }, _sum: { remainingUsd: true } }) : [];
  const balance = new Map(lots.map((l) => [l.userId, l._sum.remainingUsd ?? 0]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="heading">Customers and rewards</h1>
        <span className="flex flex-wrap gap-x-4 gap-y-2">
          <Link href="/admin/accounts" className="ss-link body-s inline-flex min-h-11 items-center">
            New accounts to approve
          </Link>
          <Link href="/admin/orders" className="ss-link body-s inline-flex min-h-11 items-center">
            All orders
          </Link>
        </span>
      </div>
      <p className="text-ink-muted">
        Tiers: {TIER_IDS.map((id) => `${TIERS[id].label} (${TIERS[id].minPaidOrders}+ printed orders: ${TIERS[id].limits.book} book${TIERS[id].limits.book === 1 ? "" : "s"}${TIERS[id].window === "30d" ? " a month" : " to try"})`).join(" · ")}
      </p>
      {sp.credited && (
        <p className="ss-note ss-note--success" role="status">
          Added {sp.credited}.
        </p>
      )}
      {sp.error && <p className="ss-note ss-note--warn" role="alert">{sp.error === "amount" ? "Enter an amount from $0.01 to $500." : "That customer wasn't found."}</p>}
      {sp.reset && (
        <p className="ss-note ss-note--success" role="status">
          Character count reset for {sp.reset}. Their earlier character tries no longer count toward their limits.
        </p>
      )}
      {sp.saved && (
        <p className="ss-note ss-note--success" role="status">
          Saved.
        </p>
      )}
      <p className="body-s text-ink-muted sm:hidden">Scroll the table sideways to see every column.</p>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-paper-raised">
        <table className="w-full min-w-[56rem] text-left text-sm" data-testid="admin-users">
          <thead className="bg-paper-sunk">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Used (books, characters, redraws)</th>
              <th className="p-3">Rewards</th>
              {credits && <th className="p-3">Credits</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, a }) => (
              <tr key={u.id} className="border-t border-line align-top">
                <td className="p-3">
                  {u.email}
                  <div className="text-ink-muted">joined {u.createdAt.toLocaleDateString()}</div>
                </td>
                <td className="p-3">
                  {a.unlimited ? "Admin (unlimited)" : a.tier.label}
                  <div className="text-ink-muted">{a.paidOrders} printed order(s)</div>
                </td>
                <td className="p-3">
                  {a.used.book}/{a.limits.book} · {a.used.character}/{a.limits.character} · {a.used.redraw}/{a.limits.redraw}
                  <form action={resetCharactersAction} className="mt-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <button className="ss-btn ss-btn--secondary ss-btn--sm" data-testid={`reset-characters-${u.email}`} title="Character tries made before now stop counting toward this account's limits">
                      Reset characters
                    </button>
                  </form>
                  {a.characterResetAt && <div className="mt-1 text-ink-muted">Characters reset {a.characterResetAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
                </td>
                <td className="p-3">
                  <form action={saveRewardsAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <label className="text-sm font-semibold">
                      Tier
                      <select name="tierOverride" defaultValue={u.tierOverride ?? ""} className="ss-input mt-1 w-auto px-3 font-normal">
                        <option value="">By orders</option>
                        {TIER_IDS.map((id) => (
                          <option key={id} value={id}>
                            {TIERS[id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["bonusBooks", "bonusCharacters", "bonusRedraws"] as const).map((f) => (
                      <label key={f} className="text-sm font-semibold">
                        {f === "bonusBooks" ? "+ books" : f === "bonusCharacters" ? "+ characters" : "+ redraws"}
                        <input name={f} type="number" min={0} max={500} defaultValue={u[f]} className="ss-input mt-1 w-24 px-3 font-normal" />
                      </label>
                    ))}
                    <button className="ss-btn ss-btn--secondary ss-btn--sm">Save</button>
                  </form>
                </td>
                {credits && (
                  <td className="p-3">
                    <div className="font-semibold tabular-nums" data-testid={`balance-${u.email}`}>${(balance.get(u.id) ?? 0).toFixed(2)}</div>
                    <form action={addCreditsAction} className="mt-1 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="userId" value={u.id} />
                      <input type="hidden" name="key" value={randomUUID()} />
                      <label className="text-sm font-semibold">
                        Add $
                        <input name="amount" type="number" min={0.01} max={500} step={0.01} required className="ss-input mt-1 w-24 px-3 font-normal" />
                      </label>
                      <label className="text-sm font-semibold">
                        Note
                        <input name="note" maxLength={120} placeholder="Gift" className="ss-input mt-1 w-32 px-3 font-normal" />
                      </label>
                      <button className="ss-btn ss-btn--secondary ss-btn--sm" data-testid={`add-credits-${u.email}`}>
                        Add
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
