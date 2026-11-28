import { describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { customerLines, priceQuote } from "@/lib/orders/pricing";
import { parseAddress } from "@/lib/orders/address";
import { shouldApply } from "@/lib/orders/status";
import { StripePaymentProvider } from "@/lib/providers/stripe/payment";
import { WebhookSignatureError, type PrintQuote } from "@/lib/providers/print/types";

const printer: PrintQuote = { currency: "USD", shippingLevel: "MAIL", printCost: 17.28, shippingCost: 5.39, fulfillmentCost: 0.81, fees: 0.5, tax: 1.78, total: 23.98 };

describe("customer price", () => {
  it("is the printer's total when there is no margin and fees aren't covered", () => {
    const q = priceQuote(printer, { marginPercent: 0, marginFlatUsd: 0, coverCardFees: false });
    expect(q.totalCents).toBe(2398);
    expect(q.margin).toBe(0);
  });
  it("adds the margin on everything but shipping, then grosses up so the card fee doesn't eat it", () => {
    const q = priceQuote(printer, { marginPercent: 10, marginFlatUsd: 1, coverCardFees: true });
    expect(q.margin).toBe(2.86); // 10% of (23.98 - 5.39 shipping) + $1
    // After Stripe takes 2.9% + 30c, at least cost + margin is left.
    const net = q.totalCents - Math.round(q.totalCents * 0.029) - 30;
    expect(net).toBeGreaterThanOrEqual(2398 + 286);
    expect(net - (2398 + 286)).toBeLessThanOrEqual(1);
    expect(q.cardFees).toBeCloseTo((q.totalCents - 2684) / 100, 2);
  });
  it("passes shipping through at cost: a pricier shipping option adds exactly its own cost before the card fee", () => {
    const cfg = { marginPercent: 20, marginFlatUsd: 0, coverCardFees: false, creditChargeUsd: 5 };
    const mail = priceQuote(printer, cfg);
    const express = priceQuote({ ...printer, shippingLevel: "EXPRESS", shippingCost: 25.39, total: 43.98 }, cfg);
    expect(express.margin).toBe(mail.margin);
    expect(express.totalCents - mail.totalCents).toBe(2000);
  });
  it("charges 20% on the book plus $5 for the account credit, covered by the card fee allowance", () => {
    const q = priceQuote(printer, { marginPercent: 20, marginFlatUsd: 0, coverCardFees: true, creditChargeUsd: 5 });
    expect(q.margin).toBe(3.72); // 20% of 18.59
    expect(q.creditCharge).toBe(5);
    const net = q.totalCents - Math.round(q.totalCents * 0.029) - 30;
    expect(net).toBeGreaterThanOrEqual(2398 + 372 + 500);
  });
});

describe("customer price lines", () => {
  const q = priceQuote(printer, { marginPercent: 20, marginFlatUsd: 0, coverCardFees: true, creditChargeUsd: 5 });
  it("roll printing, fulfillment, fees, card fee allowance and margin into one book line that never names the margin", () => {
    const lines = customerLines(q, "Theo and the Moon");
    expect(lines.map((l) => l.label)).toEqual(["Book: Theo and the Moon", "Shipping", "Account credit"]);
    expect(lines.find((l) => l.key === "shipping")!.cents).toBe(539);
    expect(lines.find((l) => l.key === "credit")!.cents).toBe(500);
    // Book = printing + fulfillment + fees + margin + card fee allowance, so the lines add up to the total exactly.
    expect(lines.find((l) => l.key === "book")!.cents).toBe(1728 + 81 + 50 + 372 + Math.round(q.cardFees * 100));
    expect(lines.reduce((s, l) => s + l.cents, 0)).toBe(q.totalCents);
    expect(JSON.stringify(lines)).not.toMatch(/margin|fee/i);
  });
  it("leave out the credit line for older orders that had no credit charge", () => {
    const old = { ...q, creditCharge: undefined };
    expect(customerLines(old, "Old book").map((l) => l.key)).toEqual(["book", "shipping"]);
    expect(customerLines(old, "Old book").reduce((s, l) => s + l.cents, 0)).toBe(q.totalCents);
  });
});

describe("shipping address checks", () => {
  const ok = { name: "Grandma Rose", street1: "12 Elm Street", city: "Springfield", stateCode: "il", postcode: "62704", countryCode: "us", phone: "217-555-0100" };
  it("accepts a good US address and normalizes codes", () => {
    const r = parseAddress(ok);
    expect(r.ok && r.address).toMatchObject({ stateCode: "IL", countryCode: "US" });
    expect(r.ok && r.address.street2).toBeFalsy();
  });
  it("explains each problem in plain English, with the printer's length limits", () => {
    const r = parseAddress({ ...ok, name: "A", street1: "1234 Extraordinarily Long Avenue Name", stateCode: "", postcode: "6270", phone: "12" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.name).toMatch(/full name/);
    expect(r.errors.street1).toMatch(/30 characters/);
    expect(r.errors.stateCode).toMatch(/state or province/);
    expect(r.errors.postcode).toMatch(/5-digit ZIP/);
    expect(r.errors.phone).toMatch(/phone number/);
  });
  it("needs a state only where the printer does", () => {
    expect(parseAddress({ ...ok, countryCode: "GB", stateCode: "", postcode: "SW1A 1AA" }).ok).toBe(true);
    expect(parseAddress({ ...ok, countryCode: "CA", stateCode: "", postcode: "M5V 2T6" }).ok).toBe(false);
  });
});

describe("printer status updates", () => {
  it("only move forward, except rejections and cancellations", () => {
    expect(shouldApply("paid", "created")).toBe(true);
    expect(shouldApply("created", "in_production")).toBe(true);
    expect(shouldApply("shipped", "in_production")).toBe(false); // a late webhook
    expect(shouldApply("shipped", "shipped")).toBe(false);
    expect(shouldApply("in_production", "rejected")).toBe(true);
    expect(shouldApply("rejected", "created")).toBe(true); // sent again
    expect(shouldApply("refunded", "cancelled")).toBe(false);
    expect(shouldApply("awaiting_payment", "created")).toBe(false);
  });
});

describe("Stripe adapter (no network)", () => {
  const real = new Stripe("sk_test_dummy");
  function fakeClient() {
    const create = vi.fn(async () => ({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" }));
    const retrieve = vi.fn(async () => ({ id: "cs_test_1", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 2999, client_reference_id: "order_1", metadata: {} }));
    const refunds = vi.fn(async () => ({ id: "re_1" }));
    const client = { checkout: { sessions: { create, retrieve } }, refunds: { create: refunds }, webhooks: real.webhooks } as unknown as Stripe;
    return { client, create, retrieve, refunds };
  }

  it("refuses live keys unless live orders are allowed", () => {
    expect(() => new StripePaymentProvider({ secretKey: "sk_live_x", allowLive: false })).toThrow(/live key/);
    expect(() => new StripePaymentProvider({ secretKey: "sk_live_x", allowLive: true, client: fakeClient().client })).not.toThrow();
  });

  it("creates a one-hour hosted checkout for the exact amount, tagged with the order", async () => {
    const { client, create } = fakeClient();
    const p = new StripePaymentProvider({ secretKey: "sk_test_x", allowLive: false, client });
    const s = await p.createCheckout({ orderId: "order_1", amountCents: 2999, currency: "usd", productName: "Oliver (Hardcover)", description: "32 pages", successUrl: "http://localhost:3000/orders/order_1?session_id={CHECKOUT_SESSION_ID}", cancelUrl: "http://localhost:3000/books/b/order" });
    expect(s).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" });
    const params = (create.mock.calls[0] as unknown[])[0] as Stripe.Checkout.SessionCreateParams;
    expect(params).toMatchObject({
      mode: "payment",
      client_reference_id: "order_1",
      metadata: { orderId: "order_1" },
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: 2999, product_data: { name: "Oliver (Hardcover)" } } }],
      success_url: "http://localhost:3000/orders/order_1?session_id={CHECKOUT_SESSION_ID}",
    });
    expect(params.expires_at! - Date.now() / 1000).toBeGreaterThan(3500);
  });

  it("reports a session as paid only when Stripe says so, and refunds by payment intent", async () => {
    const { client, refunds } = fakeClient();
    const p = new StripePaymentProvider({ secretKey: "sk_test_x", allowLive: false, client });
    expect(await p.getCheckout("cs_test_1")).toEqual({ id: "cs_test_1", status: "complete", paid: true, paymentRef: "pi_1", amountCents: 2999, orderId: "order_1" });
    expect(await p.refund("pi_1")).toEqual({ id: "re_1" });
    expect(refunds).toHaveBeenCalledWith({ payment_intent: "pi_1" }, { idempotencyKey: "refund-pi_1" });
  });

  it("verifies webhook signatures on the raw body and maps checkout events", async () => {
    const { client } = fakeClient();
    const p = new StripePaymentProvider({ secretKey: "sk_test_x", allowLive: false, webhookSecret: "whsec_test", client });
    const event = (type: string) => JSON.stringify({ id: "evt_1", object: "event", type, data: { object: { id: "cs_test_1", object: "checkout.session" } } });
    const sign = (payload: string) => real.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" });
    for (const [type, mapped] of [
      ["checkout.session.completed", "checkout.completed"],
      ["checkout.session.async_payment_succeeded", "checkout.completed"],
      ["checkout.session.async_payment_failed", "checkout.payment_failed"],
      ["checkout.session.expired", "checkout.expired"],
    ]) {
      const body = event(type);
      expect(await p.parseWebhook(body, { "stripe-signature": sign(body) })).toEqual({ type: mapped, sessionId: "cs_test_1" });
    }
    const body = event("checkout.session.completed");
    await expect(p.parseWebhook(body, { "stripe-signature": sign(event("checkout.session.expired")) })).rejects.toBeInstanceOf(WebhookSignatureError);
    const noSecret = new StripePaymentProvider({ secretKey: "sk_test_x", allowLive: false, client });
    await expect(noSecret.parseWebhook(body, { "stripe-signature": sign(body) })).rejects.toBeInstanceOf(WebhookSignatureError);
    const other = event("customer.created").replace("checkout.session", "customer");
    expect(await p.parseWebhook(other, { "stripe-signature": sign(other) })).toBeNull();
  });
});
