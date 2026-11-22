/**
 * Buying credit packs through the same payment provider as printed books
 * (Stripe Checkout, or the offline mock). Credits are added once, when the
 * payment is confirmed by the webhook or the return page.
 */
import { db } from "../db";
import { getConfig } from "../config";
import { log, errorMessage } from "../log";
import { getPaymentProvider } from "../providers/registry";
import type { PaymentEvent } from "../providers/payment/types";
import { creditPacks, grantCredits } from "./index";

export type PurchaseResult = { ok: true; url: string } | { ok: false; message: string };

export async function startCreditPurchase(userId: string, amountUsd: number): Promise<PurchaseResult> {
  if (!getConfig().CREDITS_ENABLED) return { ok: false, message: "Credits aren't turned on." };
  if (!creditPacks().includes(amountUsd)) return { ok: false, message: "Choose one of the credit packs." };
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const payment = getPaymentProvider();
  const priceCents = Math.round(amountUsd * 100);
  const purchase = await db.creditPurchase.create({ data: { userId, amountUsd, priceCents, paymentProvider: payment.name } });
  try {
    const appUrl = getConfig().APP_URL.replace(/\/$/, "");
    const session = await payment.createCheckout({
      orderId: `credits_${purchase.id}`,
      amountCents: priceCents,
      currency: "usd",
      productName: `StoryStar credits ($${amountUsd})`,
      description: `$${amountUsd} of credits for making picture books (they last ${getConfig().CREDIT_EXPIRY_MONTHS} months)`,
      customerEmail: user.email.endsWith(".local") ? undefined : user.email,
      successUrl: `${appUrl}/credits?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${appUrl}/credits?cancelled=1`,
    });
    await db.creditPurchase.update({ where: { id: purchase.id }, data: { checkoutSessionId: session.id } });
    return { ok: true, url: session.url };
  } catch (err) {
    log.error("Could not start a credit purchase", { err: errorMessage(err) });
    await db.creditPurchase.updateMany({ where: { id: purchase.id }, data: { status: "expired" } });
    return { ok: false, message: "The payment page couldn't open. Please try again in a moment." };
  }
}

/** Confirms a credit purchase (safe to call many times): adds the credits once. */
export async function fulfillCreditPurchase(sessionId: string) {
  const purchase = await db.creditPurchase.findUnique({ where: { checkoutSessionId: sessionId } });
  if (!purchase || purchase.status === "paid") return purchase;
  const state = await getPaymentProvider().getCheckout(sessionId);
  if (state.status === "expired" && !state.paid) {
    await db.creditPurchase.updateMany({ where: { id: purchase.id, status: "awaiting_payment" }, data: { status: "expired" } });
    return db.creditPurchase.findUnique({ where: { id: purchase.id } });
  }
  if (!state.paid) return purchase;
  await db.$transaction(async (tx) => {
    const r = await tx.creditPurchase.updateMany({ where: { id: purchase.id, status: { not: "paid" } }, data: { status: "paid", paidAt: new Date(), paymentRef: state.paymentRef } });
    if (r.count === 1) await grantCredits(purchase.userId, purchase.amountUsd, "purchase", { sourceKey: `purchase:${purchase.id}`, note: `Bought $${purchase.amountUsd} of credits` }, tx);
  });
  return db.creditPurchase.findUnique({ where: { id: purchase.id } });
}

export async function handleCreditPurchaseEvent(event: PaymentEvent) {
  if (event.type === "checkout.completed") return fulfillCreditPurchase(event.sessionId);
  if (event.type === "checkout.expired") await db.creditPurchase.updateMany({ where: { checkoutSessionId: event.sessionId, status: "awaiting_payment" }, data: { status: "expired" } });
  return null;
}
