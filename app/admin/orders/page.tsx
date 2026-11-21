import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isAdmin, quoteOf } from "@/lib/orders/service";
import { formatMoney } from "@/lib/orders/pricing";
import { OrderStatusBadge } from "@/components/OrderStatus";
import { checkStatusAction, refundOrderAction, resendOrderAction } from "@/app/orders/actions";
import type { ShippingAddress } from "@/lib/providers/print/types";

export const dynamic = "force-dynamic";

/** Every order with its printer status, plus the actions that need a human. */
export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ error?: string; refunded?: string; resent?: string; status?: string }> }) {
  const user = await requireOnboardedUser();
  if (!isAdmin(user)) notFound();
  const sp = await searchParams;
  const orders = await db.order.findMany({
    where: sp.status ? { status: sp.status } : { status: { notIn: ["expired"] } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { email: true } } },
  });
  const attention = orders.filter((o) => ["failed", "rejected"].includes(o.status) || (o.providerStatus === "UNPAID" && o.status === "created"));
  const paidCents = orders.filter((o) => o.paidAt && o.status !== "refunded").reduce((s, o) => s + o.totalCents, 0);
  const marginCents = orders.filter((o) => o.paidAt && o.status !== "refunded").reduce((s, o) => s + Math.round((quoteOf(o)?.margin ?? 0) * 100), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium">All orders</h1>
        <Link href="/admin/users" className="text-sm font-semibold text-cobalt underline">
          Customers and rewards
        </Link>
        <p className="text-[color:var(--muted)]">
          {orders.length} shown · {formatMoney(paidCents)} paid · {formatMoney(marginCents)} margin · {attention.length} need attention
        </p>
      </div>
      {sp.error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.error}</p>}
      {sp.refunded && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Refunded.</p>}
      <div className="flex flex-wrap gap-2 text-sm">
        {["", "awaiting_payment", "paid", "created", "in_production", "shipped", "delivered", "rejected", "failed", "refunded"].map((s) => (
          <Link key={s || "all"} href={s ? `/admin/orders?status=${s}` : "/admin/orders"} className={`chip ${sp.status === s || (!sp.status && !s) ? "ring-cobalt" : ""}`}>
            {s || "all"}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-[color:var(--line)]">
        <table className="w-full text-left text-sm" data-testid="admin-orders">
          <thead className="bg-cream">
            <tr>
              <th className="p-3">Order</th>
              <th className="p-3">Customer / ship to</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">Printer</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const a = o.address as unknown as ShippingAddress | null;
              const back = `/admin/orders${sp.status ? `?status=${sp.status}` : ""}`;
              return (
                <tr key={o.id} className="border-t border-[color:var(--line)] align-top">
                  <td className="p-3">
                    <Link href={`/orders/${o.id}`} className="font-semibold text-cobalt underline">
                      {o.id.slice(-8).toUpperCase()}
                    </Link>
                    <div>{o.bookTitle}</div>
                    <div className="text-[color:var(--muted)]">{o.createdAt.toLocaleString()}</div>
                  </td>
                  <td className="p-3">
                    <div>{o.user.email}</div>
                    <div className="text-[color:var(--muted)]">
                      {a?.name}, {a?.city} {a?.countryCode}
                    </div>
                  </td>
                  <td className="p-3">
                    {formatMoney(o.totalCents, o.currency)}
                    <div className="text-[color:var(--muted)]">{o.paymentProvider}{o.paymentRef ? ` · ${o.paymentRef}` : ""}</div>
                  </td>
                  <td className="p-3">
                    <OrderStatusBadge status={o.status} />
                    {o.statusReason && <div className="mt-1 max-w-xs text-[color:var(--muted)]">{o.statusReason}</div>}
                  </td>
                  <td className="p-3">
                    {o.provider}
                    {o.providerOrderId ? ` #${o.providerOrderId}` : ""}
                    <div className="text-[color:var(--muted)]">{o.providerStatus ?? ""}</div>
                    {o.trackingNumber && <div>Tracking {o.trackingNumber}</div>}
                  </td>
                  <td className="space-y-2 p-3">
                    {o.providerOrderId && (
                      <form action={checkStatusAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="btn btn-secondary btn-sm">Check now</button>
                      </form>
                    )}
                    {["rejected", "failed", "cancelled"].includes(o.status) && o.paidAt && (
                      <form action={resendOrderAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="btn btn-secondary btn-sm">Send again</button>
                      </form>
                    )}
                    {["paid", "failed", "rejected", "cancelled"].includes(o.status) && o.paymentRef && (
                      <form action={refundOrderAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <button className="btn btn-secondary btn-sm">Refund</button>
                      </form>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
