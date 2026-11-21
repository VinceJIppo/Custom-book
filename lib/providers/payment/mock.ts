import crypto from "node:crypto";
import { WebhookSignatureError } from "../print/types";
import type { CheckoutRequest, CheckoutSession, CheckoutState, PaymentEvent, PaymentProvider } from "./types";

interface MockSession extends CheckoutState {
  successUrl: string;
  cancelUrl: string;
}

/**
 * Offline checkout: the "payment page" is /checkout/mock/<id> inside the app,
 * with a test Pay button. Sessions live in memory (shared across module
 * copies), so a server restart forgets unpaid test checkouts.
 */
const store: Map<string, MockSession> = ((globalThis as { __mockCheckouts?: Map<string, MockSession> }).__mockCheckouts ??= new Map());

export const MOCK_PAYMENT_WEBHOOK_SECRET = "mock-payment-webhook-secret";

export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock";

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const id = `mock_cs_${crypto.randomUUID().replace(/-/g, "")}`;
    store.set(id, { id, status: "open", paid: false, amountCents: req.amountCents, orderId: req.orderId, successUrl: req.successUrl.replace("{CHECKOUT_SESSION_ID}", id), cancelUrl: req.cancelUrl });
    return { id, url: `/checkout/mock/${id}` };
  }

  async getCheckout(sessionId: string): Promise<CheckoutState> {
    const s = store.get(sessionId);
    if (!s) return { id: sessionId, status: "expired", paid: false };
    return { id: s.id, status: s.status, paid: s.paid, paymentRef: s.paymentRef, amountCents: s.amountCents, orderId: s.orderId };
  }

  /** The test Pay button. Returns where to send the browser next. */
  pay(sessionId: string): string | null {
    const s = store.get(sessionId);
    if (!s || s.status === "expired") return null;
    s.status = "complete";
    s.paid = true;
    s.paymentRef = s.paymentRef ?? `mock_pi_${crypto.randomUUID().slice(0, 8)}`;
    return s.successUrl;
  }

  /** The test Cancel link. */
  cancel(sessionId: string): string | null {
    return store.get(sessionId)?.cancelUrl ?? null;
  }

  session(sessionId: string) {
    return store.get(sessionId) ?? null;
  }

  /** Body: { type, sessionId }, signed (HMAC-SHA256 hex) with MOCK_PAYMENT_WEBHOOK_SECRET in x-mock-signature. */
  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent | null> {
    const mac = crypto.createHmac("sha256", MOCK_PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const given = headers["x-mock-signature"] ?? "";
    if (given.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(mac))) throw new WebhookSignatureError();
    const e = JSON.parse(rawBody) as PaymentEvent;
    return e.type && e.sessionId ? e : null;
  }

  async refund(paymentRef: string) {
    return { id: `mock_re_${paymentRef}` };
  }
}
