import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";

const TONE: Record<string, string> = {
  awaiting_payment: "bg-sky text-navy",
  paid: "bg-tint text-cobalt",
  created: "bg-tint text-cobalt",
  in_production: "bg-tint text-cobalt",
  shipped: "bg-emerald-50 text-emerald-800",
  delivered: "bg-emerald-100 text-emerald-900",
  rejected: "bg-amber-100 text-amber-900",
  failed: "bg-red-100 text-red-800",
  payment_failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-700",
  expired: "bg-gray-100 text-gray-700",
  refunded: "bg-gray-100 text-gray-700",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${TONE[status] ?? "bg-gray-100"}`} data-testid="order-status">
      {STATUS_LABELS[status as OrderStatus] ?? status}
    </span>
  );
}

const STEPS: Array<{ key: string; label: string }> = [
  { key: "paid", label: "Paid" },
  { key: "created", label: "With the printer" },
  { key: "in_production", label: "Printing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
];

/** Progress bar for the happy path. */
export function OrderSteps({ status }: { status: string }) {
  const i = STEPS.findIndex((s) => s.key === status);
  if (i < 0) return null;
  return (
    <ol className="grid grid-cols-5 gap-2 text-center text-xs sm:text-sm">
      {STEPS.map((s, n) => (
        <li key={s.key}>
          <div className={`mb-1 h-2 rounded-full ${n <= i ? "bg-cobalt" : "bg-sky"}`} />
          <span className={n <= i ? "font-semibold text-cobalt" : "text-[color:var(--muted)]"}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
