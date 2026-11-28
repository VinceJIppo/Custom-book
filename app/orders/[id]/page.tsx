import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { fulfillCheckout, getOrder, isAdmin, quoteOf } from "@/lib/orders/service";
import { customerLines, formatMoney, SHIPPING_LABELS } from "@/lib/orders/pricing";
import { historyMessage, STATUS_LABELS, type OrderStatus, type StatusEvent } from "@/lib/orders/status";
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
      <Link href="/orders" className="ss-link body-s inline-flex min-h-11 items-center">
        ← All orders
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="heading break-words">{order.bookTitle}</h1>
          <p className="mt-1 text-ink-muted">
            Order {order.id.slice(-8).toUpperCase()} · placed {order.createdAt.toLocaleString()}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>
      {sp.error && (
        <p className="ss-note ss-note--error" role="alert">
          {sp.error}
        </p>
      )}
      {sp.resent && (
        <p className="ss-note ss-note--success" role="status">
          Sent to the printer again with the new print files.
        </p>
      )}

      <section className="ss-card ss-card--piped space-y-4">
        <OrderSteps status={order.status} />
        {order.status === "awaiting_payment" && <p className="animate-pulse text-delft">Waiting for the payment to be confirmed...</p>}
        {order.status === "paid" && <p className="animate-pulse text-delft">Payment received. Sending your book to the printer...</p>}
        {order.statusReason && !fixable && (
          <p className="text-ink-muted" data-testid="status-reason">
            {order.statusReason}
          </p>
        )}
        {fixable && (
          <div className="ss-note ss-note--warn" data-testid="fix-path">
            <p className="font-semibold">{order.status === "failed" ? "We couldn't send this order to the printer." : order.status === "cancelled" ? "The printer cancelled this order." : "The printer couldn't print this order."}</p>
            {order.statusReason && <p className="mt-1">Reason: {order.statusReason}</p>}
            <p className="mt-2">How to fix it: correct the book if needed, make new print files on the Print files page, then send the order again. You won&apos;t be charged again.</p>
            <div className="mt-3 flex flex-wrap gap-3">
              {order.bookId && (
                <Link href={`/books/${order.bookId}/print`} className="ss-btn ss-btn--secondary ss-btn--sm">
                  Make new print files
                </Link>
              )}
              <form action={resendOrderAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button className="ss-btn ss-btn--primary ss-btn--sm" data-testid="resend">
                  Send to the printer again
                </button>
              </form>
            </div>
          </div>
        )}
        {(order.trackingUrl || order.trackingNumber) && (
          <p className="break-words" data-testid="tracking">
            Tracking: {order.carrier ? `${order.carrier} ` : ""}
            {order.trackingUrl ? (
              <a href={order.trackingUrl} className="ss-link" target="_blank" rel="noreferrer">
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
          <form action={checkStatusAction} className="body-s flex flex-wrap items-center gap-3 text-ink-muted">
            <input type="hidden" name="orderId" value={order.id} />
            <span className="min-w-0 wrap-anywhere">
              {admin ? `${order.provider === "mock" ? "Test printer" : "Lulu"} job ${order.providerOrderId}${order.providerStatus ? ` (${order.providerStatus})` : ""}` : `Printer status: ${STATUS_LABELS[order.status as OrderStatus] ?? order.status}`}
              {order.lastCheckedAt ? ` · checked ${order.lastCheckedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
            </span>
            {/* The one primary per view: "Send to the printer again" when the order needs a fix, otherwise this. */}
            <button className={`ss-btn ss-btn--sm ${fixable ? "ss-btn--secondary" : "ss-btn--primary"}`} data-testid="check-status">
              Check status now
            </button>
          </form>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="ss-card min-w-0">
          <h2 className="title mb-3">Shipping to</h2>
          {a && (
            <address className="not-italic break-words">
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
          <p className="body-s mt-2 text-ink-muted">{SHIPPING_LABELS[order.shippingLevel as ShippingLevel] ?? order.shippingLevel}</p>
          {order.giftNote && (
            <p className="body-s mt-4 break-words rounded-[var(--radius-sm)] bg-paper-sunk p-3">
              <span className="font-semibold">Gift note:</span> {order.giftNote}
            </p>
          )}
        </section>
        <section className="ss-card min-w-0">
          <h2 className="title mb-3">Total</h2>
          <p className="text-2xl font-bold" data-testid="order-total">
            {formatMoney(order.totalCents, order.currency)}
          </p>
          <p className="body-s mt-1 text-ink-muted">
            {quote && quote.printer.tax > 0 ? `Includes ${formatMoney(Math.round(quote.printer.tax * 100), order.currency)} tax.` : "Tax included."} {order.pageCount} pages.
          </p>
          {quote && (
            <dl className="body-s mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 [&_dd]:m-0 [&_dd]:text-right [&_dd]:tabular-nums" data-testid="price-lines">
              {customerLines({ ...quote, totalCents: order.totalCents }, order.bookTitle).map((l) => (
                <Fragment key={l.key}>
                  <dt className="min-w-0 break-words">{l.label}</dt>
                  <dd>{formatMoney(l.cents, order.currency)}</dd>
                </Fragment>
              ))}
            </dl>
          )}
          {order.creditCents > 0 && (
            <p className="body-s mt-3" data-testid="order-credits">
              {formatMoney(order.creditCents, order.currency)} paid with credits, {formatMoney(order.totalCents - order.creditCents, order.currency)} by card.
            </p>
          )}
          {admin && quote && (
            <dl className="body-s mt-4 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-t border-line pt-3 [&_dd]:m-0 [&_dd]:text-right [&_dd]:tabular-nums" data-testid="price-breakdown">
              <dt className="col-span-2 font-semibold">Full breakdown (admins only)</dt>
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
              <dt>Account credit</dt>
              <dd>{formatMoney(Math.round((quote.creditCharge ?? 0) * 100))}</dd>
              <dt>Card fee allowance</dt>
              <dd>{formatMoney(Math.round(quote.cardFees * 100))}</dd>
            </dl>
          )}
          {files && (
            <p className="body-s mt-4">
              Exact files sent to the printer:{" "}
              <a href={files.interior} className="ss-link">
                interior PDF
              </a>
              ,{" "}
              <a href={files.cover} className="ss-link">
                cover PDF
              </a>
            </p>
          )}
        </section>
      </div>

      {history.length > 0 && (
        <section className="ss-card">
          <h2 className="title mb-3">History</h2>
          <ul className="body-s space-y-1" data-testid="order-history">
            {history.map((h, i) => (
              <li key={i} className="break-words">
                <span className="text-ink-muted">{new Date(h.at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span> · {historyMessage(h)}
                {admin && h.detail && <span className="text-ink-muted"> (admin: {h.detail})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
