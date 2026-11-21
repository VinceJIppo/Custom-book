import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { isAdmin, listOrders } from "@/lib/orders/service";
import { formatMoney } from "@/lib/orders/pricing";
import { OrderStatusBadge } from "@/components/OrderStatus";
import type { ShippingAddress } from "@/lib/providers/print/types";

export const dynamic = "force-dynamic";

export default async function Orders() {
  const user = await requireOnboardedUser();
  const orders = await listOrders(user.id);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-medium">Your orders</h1>
        {isAdmin(user) && (
          <Link href="/admin/orders" className="text-sm font-semibold text-cobalt underline">
            Admin: all orders
          </Link>
        )}
      </div>
      {orders.length === 0 ? (
        <p className="text-[color:var(--muted)]">No orders yet. Open a book and choose &quot;Order a printed copy&quot;.</p>
      ) : (
        <ul className="space-y-3" data-testid="order-list">
          {orders.map((o) => {
            const a = o.address as unknown as ShippingAddress | null;
            return (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white p-4 ring-1 ring-[color:var(--line)] hover:ring-cobalt">
                  <span>
                    <span className="block font-semibold">{o.bookTitle}</span>
                    <span className="text-sm text-[color:var(--muted)]">
                      {o.createdAt.toLocaleDateString()} · to {a?.name ?? "?"}, {a?.city ?? ""} · {formatMoney(o.totalCents, o.currency)}
                    </span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
