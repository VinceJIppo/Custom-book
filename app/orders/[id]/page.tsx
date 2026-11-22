import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { fulfillCheckout, getOrder, isAdmin, quoteOf } from "@/lib/orders/service";
import { formatMoney, SHIPPING_LABELS } from "@/lib/orders/pricing";
import type { StatusEvent } from "@/lib/orders/status";
import { getStorage } from "@/lib/storage";
import { AutoRefresh } from "@/components/AutoRefresh";
import { OrderStatusBadge, OrderSteps } from "@/components/OrderStatus";
import { checkStatusAction, resendOrderAction } from "@/app/orders/actions";
import type { ShippingAddress, ShippingLevel } from "@/lib/providers/print/types";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ session_id?: string; error?: string; resent?: string }> }) {
  const user = await requireOnboardedUser();
  const admin = isAdmin(user);
  const id = (await params).id;
  const sp = await searchParams;
  let order = await getOrder(user.id, id, { admin });
  if (!order) notFound();
  // Coming back from checkout: confirm the payment now rather than waiting for the webhook.
  if (sp.session_id && sp.session_id === order.checkoutSessionId) order = (await fulfillCheckout(sp.session_id)) ?? order;

  const a = order.address as unknown as ShippingAddress | null;
  const quote = quoteOf(order);
  const history = (Array.isArray(order.statusHistory) ? (order.statusHistory as unknown as StatusEvent[]) : []).slice().reverse();
  const storage = getStorage();
  const files =
    order.interiorPdfKey && order.coverPdfKey
      ? { interior: await storage.signedUrl(order.interiorPdfKey, 600, { downloadName: "order-interior.pdf" }), cover: await storage.signedUrl(order.coverPdfKey, 600, { downloadName: "order-cover.pdf" }) }
      : null;
  const fixable = (order.status === "rejected" || order.status === "failed" || order.status === "cancelled") && !!order.paidAt;

  return (
    <div className="space-y-6">
      <AutoRefresh active={order.status === "awaiting_payment" || order.status === "paid"} everyMs={2500} />
      <Link href="/orders" className="text-sm font-semibold text-cobalt">
        ← All orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-medium">{order.bookTitle}</h1>
          <p className="text-[color:var(--muted)]">
            Order {order.id.slice(-8).toUpperCase()} · placed {order.createdAt.toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      {sp.error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.error}</p>}
      {sp.resent && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Sent to the printer again with the new print files.</p>}

      <section className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <OrderSteps status={order.status} />
        {order.status === "awaiting_payment" && <p className="animate-pulse text-cobalt">Waiting for the payment to be confirmed...</p>}
        {order.status === "paid" && <p className="animate-pulse text-cobalt">Payment received. Sending your book to the printer...</p>}
        {order.statusReason && !fixable && <p className="text-[color:var(--muted)]" data-testid="status-reason">{order.statusReason}</p>}
        {fixable && (
          <div className="rounded-lg bg-amber-50 p-4 text-amber-900 ring-1 ring-amber-200" data-testid="fix-path">
            <p className="font-semibold">{order.status === "failed" ? "We couldn't send this order to the printer." : order.status === "cancelled" ? "The printer cancelled this order." : "The printer couldn't print this order."}</p>
            {order.statusReason && <p className="mt-1">Reason: {order.statusReason}</p>}
            <p className="mt-2">How to fix it: correct the book if needed, make new print files on the Print files page, then send the order again. You won&apos;t be charged again.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {order.bookId && (
                <Link href={`/books/${order.bookId}/print`} className="btn btn-secondary btn-sm">
                  Make new print files
                </Link>
              )}
              <form action={resendOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="btn btn-primary btn-sm" data-testid="resend">
                  Send to the printer again
                </button>
              </form>
            </div>
          </div>
        )}
        {(order.trackingUrl || order.trackingNumber) && (
          <p data-testid="tracking">
            Tracking: {order.carrier ? `${order.carrier} ` : ""}
            {order.trackingUrl ? (
              <a href={order.trackingUrl} className="font-semibold text-cobalt underline" target="_blank" rel="noreferrer">
                {order.trackingNumber ?? "track the parcel"}
              </a>
            ) : (
              order.trackingNumber
            )}
          </p>
        )}
        {order.estimatedArrival && !["delivered", "rejected", "cancelled", "refunded", "expired", "failed", "payment_failed"].includes(order.status) && (
          <p>Estimated arrival: {new Date(`${order.estimatedArrival}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        )}
        {order.providerOrderId && (
          <form action={checkStatusAction} className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--muted)]">
            <input type="hidden" name="orderId" value={order.id} />
            <span>
              {order.provider === "mock" ? "Test printer" : "Lulu"} job {order.providerOrderId}
              {order.providerStatus ? ` (${order.providerStatus})` : ""}
              {order.lastCheckedAt ? ` · checked ${order.lastCheckedAt.toLocaleString()}` : ""}
            </span>
            <button className="btn btn-secondary btn-sm" data-testid="check-status">
              Check status now
            </button>
          </form>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
          <h2 className="mb-2 font-display text-xl font-medium">Shipping to</h2>
          {a && (
            <address className="not-italic">
              {a.name}
              <br />
              {a.street1}
              {a.street2 ? `, ${a.street2}` : ""}
              <br />
              {a.city}
              {a.stateCode ? `, ${a.stateCode}` : ""} {a.postcode}
              <br />
              {a.countryCode} · {a.phone}
            </address>
          )}
          <p className="mt-2 text-sm text-[color:var(--muted)]">{SHIPPING_LABELS[order.shippingLevel as ShippingLevel] ?? order.shippingLevel}</p>
          {order.giftNote && (
            <p className="mt-3 rounded-lg bg-cream p-3 text-sm">
              <span className="font-semibold">Gift note:</span> {order.giftNote}
            </p>
          )}
        </section>
        <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
          <h2 className="mb-2 font-display text-xl font-medium">Total</h2>
          <p className="font-display text-2xl" data-testid="order-total">
            {formatMoney(order.totalCents, order.currency)}
          </p>
          <p className="text-sm text-[color:var(--muted)]">Printing, shipping and tax included. {order.pageCount} pages.</p>
          {order.creditCents > 0 && (
            <p className="text-sm" data-testid="order-credits">
              {formatMoney(order.creditCents, order.currency)} paid with credits, {formatMoney(order.totalCents - order.creditCents, order.currency)} by card.
            </p>
          )}
          {admin && quote && (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 text-sm" data-testid="price-breakdown">
              <dt>Printer: printing</dt>
              <dd>{formatMoney(Math.round(quote.printer.printCost * 100))}</dd>
              <dt>Printer: shipping</dt>
              <dd>{formatMoney(Math.round(quote.printer.shippingCost * 100))}</dd>
              <dt>Printer: fulfillment and fees</dt>
              <dd>{formatMoney(Math.round((quote.printer.fulfillmentCost + quote.printer.fees) * 100))}</dd>
              <dt>Printer: tax (included above)</dt>
              <dd>{formatMoney(Math.round(quote.printer.tax * 100))}</dd>
              <dt>Your margin</dt>
              <dd>{formatMoney(Math.round(quote.margin * 100))}</dd>
              <dt>Card fee allowance</dt>
              <dd>{formatMoney(Math.round(quote.cardFees * 100))}</dd>
            </dl>
          )}
          {files && (
            <p className="mt-3 text-sm">
              Exact files sent to the printer:{" "}
              <a href={files.interior} className="text-cobalt underline">
                interior PDF
              </a>
              ,{" "}
              <a href={files.cover} className="text-cobalt underline">
                cover PDF
              </a>
            </p>
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
          <h2 className="mb-2 font-display text-xl font-medium">History</h2>
          <ul className="space-y-1 text-sm" data-testid="order-history">
            {history.map((h, i) => (
              <li key={i}>
                <span className="text-[color:var(--muted)]">{new Date(h.at).toLocaleString()}</span> · {h.message ?? h.status}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
