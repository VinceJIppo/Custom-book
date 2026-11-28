/**
 * Stripe Checkout adapter (hosted payment page). Checked against Stripe's docs
 * on 2026-11-21 (API version 2026-11-18, stripe-node 23.2.0):
 * - checkout.sessions.create with mode "payment", inline price_data, success_url
 *   containing {CHECKOUT_SESSION_ID}, client_reference_id and metadata.
 * - Fulfil on checkout.session.completed and checkout.session.async_payment_succeeded,
 *   only when payment_status is "paid"; the same session may arrive more than once.
 * - Webhooks are verified with webhooks.constructEvent(raw body, Stripe-Signature, whsec_...).
 */
import Stripe from "stripe";
import { WebhookSignatureError } from "../print/types";
import type { CheckoutRequest, CheckoutSession, CheckoutState, PaymentEvent, PaymentProvider } from "../payment/types";

export interface StripeOptions {
  secretKey: string;
  webhookSecret?: string;
  /** Live keys are refused unless this is true. */
  allowLive: boolean;
  client?: Stripe;
}

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "stripe";
  private readonly stripe: Stripe;

  constructor(private readonly opts: StripeOptions) {
    if (opts.secretKey.startsWith("sk_live_") && !opts.allowLive) {
      throw new Error("STRIPE_SECRET_KEY is a live key, which charges real cards. Use a test key (sk_test_...), or set ALLOW_LIVE_ORDERS=true when you're ready.");
    }
    this.stripe = opts.client ?? new Stripe(opts.secretKey);
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency,
            unit_amount: req.amountCents,
            product_data: { name: req.productName, description: req.description },
          },
        },
      ],
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      client_reference_id: req.orderId,
      metadata: { orderId: req.orderId },
      payment_intent_data: { metadata: { orderId: req.orderId } },
      customer_email: req.customerEmail,
      // The printer's price can change, so a checkout is only good for an hour.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    },
    // A network retry for the same order never creates a second checkout.
    { idempotencyKey: `checkout-${req.orderId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout page URL.");
    return { id: session.id, url: session.url };
  }

  async getCheckout(sessionId: string): Promise<CheckoutState> {
    const s = await this.stripe.checkout.sessions.retrieve(sessionId);
    const pi = s.payment_intent;
    return {
      id: s.id,
      status: s.status === "complete" ? "complete" : s.status === "expired" ? "expired" : "open",
      paid: s.payment_status === "paid" || s.payment_status === "no_payment_required",
      paymentRef: typeof pi === "string" ? pi : pi?.id,
      amountCents: s.amount_total ?? undefined,
      orderId: s.client_reference_id ?? s.metadata?.orderId ?? undefined,
    };
  }

  async parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent | null> {
    if (!this.opts.webhookSecret) throw new WebhookSignatureError("STRIPE_WEBHOOK_SECRET is not set, so Stripe webhooks can't be verified.");
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, headers["stripe-signature"] ?? "", this.opts.webhookSecret);
    } catch {
      throw new WebhookSignatureError();
    }
    const obj = event.data.object as { id?: string; object?: string };
    if (obj.object !== "checkout.session" || !obj.id) return null;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        return { type: "checkout.completed", sessionId: obj.id };
      case "checkout.session.expired":
        return { type: "checkout.expired", sessionId: obj.id };
      case "checkout.session.async_payment_failed":
        return { type: "checkout.payment_failed", sessionId: obj.id };
      default:
        return null;
    }
  }

  async expireCheckout(sessionId: string) {
    try {
      await this.stripe.checkout.sessions.expire(sessionId);
    } catch (err) {
      // Stripe refuses to expire a session that is already complete or expired; that's fine.
      // Anything else (it's still open) is a real failure.
      const s = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (s.status === "open") throw err;
    }
  }

  async refund(paymentRef: string) {
    // A repeated click or retry never refunds twice.
    const r = await this.stripe.refunds.create({ payment_intent: paymentRef }, { idempotencyKey: `refund-${paymentRef}` });
    return { id: r.id };
  }
}
