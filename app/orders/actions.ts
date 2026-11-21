"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/orders/pricing";
import { isAdmin, refreshOrderStatus, refundOrder, resendOrder, shippingQuotes, startCheckout, getOrder } from "@/lib/orders/service";
import { getPaymentProvider } from "@/lib/providers/registry";
import { MockPaymentProvider } from "@/lib/providers/payment/mock";
import type { ShippingAddress } from "@/lib/providers/print/types";

export interface QuoteOption {
  level: string;
  totalCents: number;
  total: string;
  arrivalMin?: string;
  arrivalMax?: string;
}

export interface OrderFormState {
  message?: string;
  errors?: Record<string, string>;
  options?: QuoteOption[];
  warnings?: string[];
  suggestion?: Partial<ShippingAddress>;
}

function addressFrom(fd: FormData) {
  const v = (k: string) => String(fd.get(k) ?? "");
  return { name: v("name"), street1: v("street1"), street2: v("street2"), city: v("city"), stateCode: v("stateCode"), postcode: v("postcode"), countryCode: v("countryCode"), phone: v("phone"), email: v("email") };
}

/** Step 1: prices for every shipping speed (the browser never sends a price). */
export async function quoteAction(_prev: OrderFormState | null, fd: FormData): Promise<OrderFormState> {
  const user = await getCurrentUser();
  const res = await shippingQuotes(user.id, { bookId: String(fd.get("bookId") ?? ""), exportId: String(fd.get("exportId") ?? ""), address: addressFrom(fd) });
  if (!res.ok) return { message: res.message, errors: res.errors };
  return {
    options: res.quotes.map((q) => ({ level: q.shippingLevel, totalCents: q.totalCents, total: formatMoney(q.totalCents, q.currency), arrivalMin: q.arrivalMin, arrivalMax: q.arrivalMax })),
    warnings: res.warnings,
    suggestion: res.suggestion,
  };
}

/** Step 2: create the order at a fresh server-side price and go to checkout. */
export async function checkoutAction(_prev: OrderFormState | null, fd: FormData): Promise<OrderFormState> {
  const user = await getCurrentUser();
  const res = await startCheckout(user.id, {
    bookId: String(fd.get("bookId") ?? ""),
    exportId: String(fd.get("exportId") ?? ""),
    address: addressFrom(fd),
    giftNote: String(fd.get("giftNote") ?? ""),
    shippingLevel: String(fd.get("shippingLevel") ?? ""),
  });
  if (!res.ok) return { message: res.message, errors: res.errors };
  redirect(res.url);
}

export async function checkStatusAction(fd: FormData) {
  const user = await getCurrentUser();
  const orderId = String(fd.get("orderId") ?? "");
  const order = await getOrder(user.id, orderId, { admin: isAdmin(user) });
  if (order) await refreshOrderStatus(order.id).catch(() => undefined);
  revalidatePath(`/orders/${orderId}`);
  redirect(String(fd.get("back") || `/orders/${orderId}`));
}

function withParam(path: string, param: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${param}`;
}

export async function resendOrderAction(fd: FormData) {
  const user = await getCurrentUser();
  const orderId = String(fd.get("orderId") ?? "");
  const res = await resendOrder(user.id, orderId, { admin: isAdmin(user) });
  redirect(withParam(String(fd.get("back") || `/orders/${orderId}`), res.ok ? "resent=1" : `error=${encodeURIComponent(res.message)}`));
}

export async function refundOrderAction(fd: FormData) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) redirect("/orders");
  const res = await refundOrder(String(fd.get("orderId") ?? ""));
  redirect(`/admin/orders${res.ok ? "?refunded=1" : `?error=${encodeURIComponent(res.message)}`}`);
}

/** The offline test checkout's Pay and Cancel buttons. */
export async function mockPayAction(fd: FormData) {
  const payment = getPaymentProvider();
  if (!(payment instanceof MockPaymentProvider)) redirect("/orders");
  const sessionId = String(fd.get("sessionId") ?? "");
  const next = fd.get("choice") === "pay" ? payment.pay(sessionId) : payment.cancel(sessionId);
  redirect(next ?? "/orders");
}
