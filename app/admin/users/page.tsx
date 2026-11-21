import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isAdminEmail } from "@/lib/admin";
import { getAllowance, TIER_IDS, TIERS } from "@/lib/allowance";
import { saveRewardsAction } from "./actions";

export const dynamic = "force-dynamic";

/** Customers, their tier and usage, and rewards you can grant (family, friends, apologies). */
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
  const sp = await searchParams;
  const users = await db.user.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const rows = await Promise.all(users.map(async (u) => ({ u, a: await getAllowance(u.id) })));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-medium">Customers and rewards</h1>
        <Link href="/admin/orders" className="text-sm font-semibold text-cobalt underline">
          All orders
        </Link>
      </div>
      <p className="text-[color:var(--muted)]">
        Tiers: {TIER_IDS.map((id) => `${TIERS[id].label} (${TIERS[id].minPaidOrders}+ printed orders: ${TIERS[id].limits.book} book${TIERS[id].limits.book === 1 ? "" : "s"}${TIERS[id].window === "30d" ? " a month" : " to try"})`).join(" · ")}
      </p>
      {sp.saved && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Saved.</p>}
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-[color:var(--line)]">
        <table className="w-full text-left text-sm" data-testid="admin-users">
          <thead className="bg-cream">
            <tr>
              <th className="p-3">Customer</th>
              <th className="p-3">Tier</th>
              <th className="p-3">Used (books, characters, redraws)</th>
              <th className="p-3">Rewards</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ u, a }) => (
              <tr key={u.id} className="border-t border-[color:var(--line)] align-top">
                <td className="p-3">
                  {u.email}
                  <div className="text-[color:var(--muted)]">joined {u.createdAt.toLocaleDateString()}</div>
                </td>
                <td className="p-3">
                  {a.unlimited ? "Admin (unlimited)" : a.tier.label}
                  <div className="text-[color:var(--muted)]">{a.paidOrders} printed order(s)</div>
                </td>
                <td className="p-3">
                  {a.used.book}/{a.limits.book} · {a.used.character}/{a.limits.character} · {a.used.redraw}/{a.limits.redraw}
                </td>
                <td className="p-3">
                  <form action={saveRewardsAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="userId" value={u.id} />
                    <label className="text-xs">
                      Tier
                      <select name="tierOverride" defaultValue={u.tierOverride ?? ""} className="mt-1 block rounded border border-[color:var(--line)] px-2 py-1">
                        <option value="">By orders</option>
                        {TIER_IDS.map((id) => (
                          <option key={id} value={id}>
                            {TIERS[id].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    {(["bonusBooks", "bonusCharacters", "bonusRedraws"] as const).map((f) => (
                      <label key={f} className="text-xs">
                        {f === "bonusBooks" ? "+ books" : f === "bonusCharacters" ? "+ characters" : "+ redraws"}
                        <input name={f} type="number" min={0} max={500} defaultValue={u[f]} className="mt-1 block w-20 rounded border border-[color:var(--line)] px-2 py-1" />
                      </label>
                    ))}
                    <button className="btn btn-secondary btn-sm">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
