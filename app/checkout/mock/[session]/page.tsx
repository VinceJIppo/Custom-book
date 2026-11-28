import { notFound } from "next/navigation";
import { getPaymentProvider } from "@/lib/providers/registry";
import { MockPaymentProvider } from "@/lib/providers/payment/mock";
import { formatMoney } from "@/lib/orders/pricing";
import { mockPayAction } from "@/app/orders/actions";

export const dynamic = "force-dynamic";

/** Stands in for Stripe's checkout page when no Stripe key is set. No card, no charge. */
export default async function MockCheckout({ params }: { params: Promise<{ session: string }> }) {
  const payment = getPaymentProvider();
  if (!(payment instanceof MockPaymentProvider)) notFound();
  const sessionId = (await params).session;
  const session = payment.session(sessionId);
  return (
    <div className="ss-card ss-card--piped mx-auto max-w-md min-w-0 space-y-5">
      <p className="eyebrow">Test checkout</p>
      <h1 className="heading">Pay for your book</h1>
      {!session || session.status === "expired" ? (
        <p>This test checkout has expired (the app may have restarted). Go back to the book and start the order again.</p>
      ) : session.paid ? (
        <p>Already paid.</p>
      ) : (
        <>
          <p className="text-2xl font-bold">{formatMoney(session.amountCents ?? 0)}</p>
          <p className="body-s text-ink-muted">This is the offline test checkout: no card is needed and nothing is charged. Add Stripe test keys to use Stripe&apos;s real checkout page.</p>
          <form action={mockPayAction} className="flex flex-wrap gap-3">
            <input type="hidden" name="sessionId" value={sessionId} />
            <button name="choice" value="pay" className="ss-btn ss-btn--primary" data-testid="mock-pay">
              Pay (test)
            </button>
            <button name="choice" value="cancel" className="ss-btn ss-btn--secondary">
              Cancel
            </button>
          </form>
        </>
      )}
    </div>
  );
}
