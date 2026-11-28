/**
 * Payments for print orders. The app only ever talks to this interface; the
 * Stripe adapter lives in lib/providers/stripe and a mock checkout works offline.
 */
export interface CheckoutRequest {
  orderId: string;
  /** What the customer pays, in the smallest currency unit (cents). */
  amountCents: number;
  /** Lowercase ISO currency, e.g. "usd". */
  currency: string;
  productName: string;
  description: string;
  customerEmail?: string;
  /** May contain {CHECKOUT_SESSION_ID}, which the provider fills in. */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  /** Where to send the customer to pay. */
  url: string;
}

export interface CheckoutState {
  id: string;
  status: "open" | "complete" | "expired";
  /** True once the money is in (not for delayed methods still processing). */
  paid: boolean;
  /** Payment id used for refunds. */
  paymentRef?: string;
  amountCents?: number;
  orderId?: string;
}

export interface PaymentEvent {
  type: "checkout.completed" | "checkout.expired" | "checkout.payment_failed";
  sessionId: string;
}

export interface PaymentProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  getCheckout(sessionId: string): Promise<CheckoutState>;
  /** Verifies the signature on the raw body; returns null for events we don't use. */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentEvent | null>;
  refund(paymentRef: string): Promise<{ id: string }>;
  /** Closes an unpaid checkout so it can no longer be paid. Does nothing to one that's already paid or closed; check getCheckout after. */
  expireCheckout(sessionId: string): Promise<void>;
}
