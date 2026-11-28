import { STATUS_LABELS, type OrderStatus } from "@/lib/orders/status";

const TONE: Record<string, string> = {
  awaiting_payment: "ss-pill--working",
  paid: "ss-pill--working",
  created: "ss-pill--working",
  in_production: "ss-pill--working",
  shipped: "ss-pill--ready",
  delivered: "ss-pill--ready",
  rejected: "ss-pill--attention",
  failed: "ss-pill--attention",
  payment_failed: "ss-pill--attention",
  cancelled: "",
  expired: "",
  refunded: "",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return (
    <span className={`ss-pill shrink-0 ${TONE[status] ?? ""}`} data-testid="order-status">
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
    <ol className="grid grid-cols-5 gap-2 text-center text-xs leading-4 sm:text-sm sm:leading-5">
      {STEPS.map((s, n) => (
        <li key={s.key} className="min-w-0">
          <div className={`mb-1.5 h-2 rounded-full ${n <= i ? "bg-delft" : "bg-delft-wash"}`} />
          <span className={`break-words ${n <= i ? "font-semibold text-delft" : "text-ink-muted"}`}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
