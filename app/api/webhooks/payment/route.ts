import { handlePaymentWebhook } from "@/lib/orders/service";
import { webhookResponse } from "@/lib/orders/webhook";

/**
 * Payment webhooks (Stripe: point an endpoint at /api/webhooks/payment for
 * checkout.session.completed, async_payment_succeeded, async_payment_failed and
 * expired). The raw body is needed for the signature check.
 */
export async function POST(req: Request) {
  return webhookResponse("Payment", req, handlePaymentWebhook);
}
