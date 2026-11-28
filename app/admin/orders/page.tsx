import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { db } from "@/lib/db";
import { isAdmin, quoteOf } from "@/lib/orders/service";
import { formatMoney } from "@/lib/orders/pricing";
import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";
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
    include: { user: { select: { email: true, deletedAt: true } } },
  });
  const attention = orders.filter((o) => ["failed", "rejected"].includes(o.status) || (o.providerStatus === "UNPAID" && o.status === "created"));
  const paidCents = orders.filter((o) => o.paidAt && o.status !== "refunded").reduce((s, o) => s + o.totalCents, 0);
  const marginCents = orders.filter((o) => o.paidAt && o.status !== "refunded").reduce((s, o) => s + Math.round((quoteOf(o)?.margin ?? 0) * 100), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading">All orders</h1>
        <Link href="/admin/users" className="ss-link body-s inline-flex min-h-11 items-center">
          Customers and rewards
        </Link>
        <p className="mt-2 text-ink-muted">
          {orders.length} shown · {formatMoney(paidCents)} paid · {formatMoney(marginCents)} margin · {attention.length} need attention
        </p>
      </div>
      {sp.error && (
        <p className="ss-note ss-note--warn break-words" role="alert">
          {sp.error}
        </p>
      )}
      {sp.refunded && (
        <p className="ss-note ss-note--success" role="status">
          Refunded.
        </p>
      )}
      <nav className="flex flex-wrap gap-2" aria-label="Filter by status">
        {["", "awaiting_payment", "paid", "created", "in_production", "shipped", "delivered", "rejected", "failed", "refunded"].map((s) => (
          <Link key={s || "all"} href={s ? `/admin/orders?status=${s}` : "/admin/orders"} className={`ss-chip ${sp.status === s || (!sp.status && !s) ? "border-2 border-delft bg-delft-wash" : ""}`} aria-current={sp.status === s || (!sp.status && !s) ? "page" : undefined}>
            {s ? (STATUS_LABELS[s as OrderStatus] ?? s) : "All"}
          </Link>
        ))}
      </nav>
      <p className="body-s text-ink-muted sm:hidden">Scroll the table sideways to see every column.</p>
      <div className="overflow-x-auto rounded-[var(--radius-md)] border border-line bg-paper-raised">
        <table className="w-full min-w-[56rem] text-left text-sm" data-testid="admin-orders">
          <thead className="bg-paper-sunk">
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
                <tr key={o.id} className="border-t border-line align-top">
                  <td className="p-3">
                    <Link href={`/orders/${o.id}`} className="ss-link">
                      {o.id.slice(-8).toUpperCase()}
                    </Link>
                    <div>{o.bookTitle}</div>
                    <div className="text-ink-muted">{o.createdAt.toLocaleString()}</div>
                  </td>
                  <td className="p-3">
                    <div>{o.user.deletedAt ? <span className="text-ink-muted">Deleted account</span> : o.user.email}</div>
                    <div className="text-ink-muted">
                      {a?.name}, {a?.city} {a?.countryCode}
                    </div>
                  </td>
                  <td className="p-3">
                    {formatMoney(o.totalCents, o.currency)}
                    <div className="text-ink-muted">{o.paymentProvider}{o.paymentRef ? ` · ${o.paymentRef}` : ""}</div>
                  </td>
                  <td className="p-3">
                    <OrderStatusBadge status={o.status} />
                    {o.statusReason && <div className="mt-1 max-w-xs text-ink-muted">{o.statusReason}</div>}
                  </td>
                  <td className="p-3">
                    {o.provider}
                    {o.providerOrderId ? ` #${o.providerOrderId}` : ""}
                    <div className="text-ink-muted">{o.providerStatus ?? ""}</div>
                    {o.trackingNumber && <div>Tracking {o.trackingNumber}</div>}
                  </td>
                  <td className="space-y-2 p-3">
                    {o.providerOrderId && (
                      <form action={checkStatusAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="ss-btn ss-btn--secondary ss-btn--sm whitespace-nowrap">Check now</button>
                      </form>
                    )}
                    {["rejected", "failed", "cancelled"].includes(o.status) && o.paidAt && (
                      <form action={resendOrderAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="ss-btn ss-btn--secondary ss-btn--sm whitespace-nowrap">Send again</button>
                      </form>
                    )}
                    {["paid", "failed", "rejected", "cancelled"].includes(o.status) && o.paymentRef && (
                      <form action={refundOrderAction}>
                        <input type="hidden" name="orderId" value={o.id} />
                        <button className="ss-btn ss-btn--danger ss-btn--sm whitespace-nowrap">Refund</button>
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
