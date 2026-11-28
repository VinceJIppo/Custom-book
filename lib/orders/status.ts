import type { PrintOrderStatus } from "../providers/print/types";

export const ORDER_STATUSES = [
  "awaiting_payment",
  "payment_failed",
  "expired",
  "paid",
  "created",
  "in_production",
  "shipped",
  "delivered",
  "rejected",
  "cancelled",
  "failed",
  "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  awaiting_payment: "Waiting for payment",
  payment_failed: "Payment failed",
  expired: "Checkout expired",
  paid: "Paid, sending to the printer",
  created: "With the printer",
  in_production: "Printing",
  shipped: "Shipped",
  delivered: "Delivered",
  rejected: "Needs a fix",
  cancelled: "Cancelled",
  failed: "Couldn't reach the printer",
  refunded: "Refunded",
};

/** Orders the worker keeps checking with the printer. */
export const OPEN_PRINT_STATUSES: OrderStatus[] = ["created", "in_production", "shipped"];

/** Progress order for printer statuses; an older update never moves an order backwards. */
const RANK: Partial<Record<OrderStatus, number>> = { created: 1, in_production: 2, shipped: 3, delivered: 4 };

/**
 * Whether a printer update should change the order's status. Rejected and
 * cancelled always apply; otherwise only forward moves do (webhooks can
 * arrive out of order).
 */
export function shouldApply(current: string, next: PrintOrderStatus): boolean {
  if (current === next) return false;
  if (next === "rejected" || next === "cancelled") return current !== "refunded";
  if (!(current in RANK)) return current === "paid" || current === "rejected";
  return (RANK[next] ?? 0) > (RANK[current as OrderStatus] ?? 0);
}

export interface StatusEvent {
  at: string;
  status: string;
  /** Plain words for the customer. */
  message?: string;
  /** The printer's own code and where it came from (shown to admins only). */
  detail?: string;
}

/** A history line in plain words. Older entries carry the printer code in brackets in the message itself; it is dropped. */
export function historyMessage(e: StatusEvent): string {
  const raw = e.message ?? STATUS_LABELS[e.status as OrderStatus] ?? e.status;
  return raw
    .replace(/\s*\((?:status check|print job created|found existing print job|webhook)(?::\s*[A-Z0-9_]+)?\)\s*(?=\S)/g, ". ")
    .replace(/\s*\((?:status check|print job created|found existing print job|webhook)(?::\s*[A-Z0-9_]+)?\)\s*$/g, "")
    .replace(/\.\s*\./g, ".");
}

export function pushHistory(history: unknown, event: Omit<StatusEvent, "at">): StatusEvent[] {
  const list = Array.isArray(history) ? (history as StatusEvent[]) : [];
  return [...list, { at: new Date().toISOString(), ...event }].slice(-50);
}
