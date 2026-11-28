"use client";

import { Fragment, useActionState, useState } from "react";
import { checkoutAction, quoteAction, type OrderFormState } from "@/app/orders/actions";

const SHIPPING_LABELS: Record<string, string> = {
  MAIL: "Standard mail",
  PRIORITY_MAIL: "Priority mail",
  GROUND_HD: "Ground (home delivery)",
  GROUND_BUS: "Ground (business)",
  GROUND: "Ground",
  EXPEDITED: "Expedited (2-day)",
  EXPRESS: "Express (overnight)",
};

type Fields = { name: string; street1: string; street2: string; city: string; stateCode: string; postcode: string; countryCode: string; phone: string; email: string; giftNote: string };

const formatUsd = (usd: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(usd);

function dateRange(min?: string, max?: string) {
  const f = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (min && max) return min === max ? `Arrives ${f(max)}` : `Arrives ${f(min)} to ${f(max)}`;
  if (max) return `Arrives by ${f(max)}`;
  return "";
}

export function OrderForm({
  bookId,
  files,
  countries,
  paymentName,
  credits,
}: {
  bookId: string;
  files: Array<{ exportId: string; label: string; detail: string }>;
  countries: Array<[string, string]>;
  paymentName: string;
  /** Credits that can go toward this book (keeping the minimum in the account), and the balance. */
  credits?: { redeemableUsd: number; balanceUsd: number; keepUsd: number; perBookUsd: number };
}) {
  const [quote, quoteFormAction, quoting] = useActionState<OrderFormState | null, FormData>(quoteAction, null);
  const [checkout, checkoutFormAction, paying] = useActionState<OrderFormState | null, FormData>(checkoutAction, null);
  const [v, setV] = useState<Fields>({ name: "", street1: "", street2: "", city: "", stateCode: "", postcode: "", countryCode: "US", phone: "", email: "", giftNote: "" });
  const [exportId, setExportId] = useState(files[0]?.exportId ?? "");
  // Prices belong to the address and files they were quoted for; any change asks for new prices.
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const key = JSON.stringify({ ...v, giftNote: "", exportId });
  const fresh = !!quote?.options?.length && quotedFor === key;
  const [level, setLevel] = useState<string | null>(null);
  const selected = quote?.options?.find((o) => o.level === level) ?? quote?.options?.[0];
  const errors = { ...(quote?.errors ?? {}), ...(checkout?.errors ?? {}) };

  const field = (name: keyof Fields, label: string, opts: { required?: boolean; hint?: string; autoComplete?: string; max?: number; wide?: boolean } = {}) => (
    <label className={`block min-w-0 ${opts.wide ? "sm:col-span-2" : ""}`}>
      <span className="label">
        {label}
        {!opts.required && <span className="font-normal text-ink-muted"> (optional)</span>}
      </span>
      <input
        name={name}
        value={v[name]}
        maxLength={opts.max}
        autoComplete={opts.autoComplete}
        onChange={(e) => setV({ ...v, [name]: e.target.value })}
        aria-invalid={!!errors[name]}
        className="ss-input mt-1"
      />
      {errors[name] ? <span className="body-s mt-1 block text-persimmon">{errors[name]}</span> : opts.hint ? <span className="body-s mt-1 block text-ink-muted">{opts.hint}</span> : null}
    </label>
  );

  return (
    <form className="space-y-6" onSubmit={() => setQuotedFor(key)}>
      <input type="hidden" name="bookId" value={bookId} />

      <section className="ss-card">
        <h2 className="title mb-4">1. The book</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map((f) => (
            <label key={f.exportId} className="ss-option group min-w-0">
              <input type="radio" name="exportId" value={f.exportId} checked={exportId === f.exportId} onChange={() => setExportId(f.exportId)} className="ss-check mt-0.5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold">{f.label}</span>
                <span className="body-s text-ink-muted group-has-checked:text-ink">{f.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="ss-card">
        <h2 className="title mb-1">2. Ship to</h2>
        <p className="body-s mb-4 text-ink-muted">Sending a gift? Enter the recipient&apos;s address. The carrier needs a phone number for delivery.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Recipient's full name", { required: true, autoComplete: "name", max: 35, wide: true })}
          {field("street1", "Street address", { required: true, autoComplete: "address-line1", max: 30, hint: "Up to 30 characters; use line 2 for the rest." })}
          {field("street2", "Apartment, suite, etc.", { autoComplete: "address-line2", max: 30 })}
          {field("city", "City", { required: true, autoComplete: "address-level2", max: 30 })}
          {field("stateCode", "State or province code", { required: v.countryCode === "US" || v.countryCode === "CA" || v.countryCode === "AU" || v.countryCode === "MX", autoComplete: "address-level1", max: 3, hint: "For example CA, NY or NSW." })}
          {field("postcode", "ZIP or postcode", { required: true, autoComplete: "postal-code", max: 20 })}
          <label className="block min-w-0">
            <span className="label">Country</span>
            <select name="countryCode" value={v.countryCode} onChange={(e) => setV({ ...v, countryCode: e.target.value })} className="ss-input mt-1">
              {countries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          {field("phone", "Phone for delivery", { required: true, autoComplete: "tel", max: 20 })}
          {field("email", "Recipient email for delivery updates", { autoComplete: "email" })}
        </div>
        {quote?.warnings && quote.warnings.length > 0 && (
          <div className="ss-note ss-note--warn mt-4" data-testid="address-warnings">
            <p className="font-semibold">Please check the address:</p>
            <ul className="list-disc pl-5">
              {quote.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            {quote.suggestion && (
              <button
                type="button"
                className="ss-btn ss-btn--secondary ss-btn--sm mt-3 h-auto min-h-11 max-w-full py-2 text-center"
                onClick={() =>
                  setV({
                    ...v,
                    street1: quote.suggestion?.street1 ?? v.street1,
                    street2: quote.suggestion?.street2 ?? v.street2,
                    city: quote.suggestion?.city ?? v.city,
                    stateCode: quote.suggestion?.stateCode ?? v.stateCode,
                    postcode: quote.suggestion?.postcode ?? v.postcode,
                  })
                }
              >
                Use the printer&apos;s suggested address
              </button>
            )}
          </div>
        )}
      </section>

      <section className="ss-card">
        <h2 id="gift-note-heading" className="title mb-1">
          3. Gift note
        </h2>
        <p className="body-s mb-4 text-ink-muted">
          Saved with the order so you remember who it was for. The printer can&apos;t put notes in the box; to have a message printed inside the book, edit its dedication page before making the print files.
        </p>
        <textarea
          name="giftNote"
          value={v.giftNote}
          maxLength={500}
          rows={3}
          onChange={(e) => setV({ ...v, giftNote: e.target.value })}
          aria-labelledby="gift-note-heading"
          className="ss-input"
          placeholder="Happy birthday, Oliver! Love, Grandma"
        />
        {errors.giftNote && <span className="body-s mt-1 block text-persimmon">{errors.giftNote}</span>}
      </section>

      <section className="ss-card ss-card--piped">
        <h2 className="title mb-4">4. Shipping and price</h2>
        {!fresh && (
          <button formAction={quoteFormAction} disabled={quoting || !exportId} className="ss-btn ss-btn--primary" data-testid="get-prices">
            {quoting ? "Asking the printer..." : quote?.options?.length ? "Update prices for this address" : "See shipping options"}
          </button>
        )}
        {quote?.message && (
          <p className="ss-note ss-note--error mt-4" role="alert">
            {quote.message}
          </p>
        )}
        {fresh && (
          <div className="space-y-3" data-testid="shipping-options">
            {quote!.options!.map((o) => (
              <label key={o.level} className="ss-option group min-w-0 items-center justify-between">
                <span className="flex min-w-0 items-center gap-3">
                  <input type="radio" name="shippingLevel" value={o.level} checked={selected?.level === o.level} onChange={() => setLevel(o.level)} className="ss-check shrink-0" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{SHIPPING_LABELS[o.level] ?? o.level}</span>
                    <span className="body-s text-ink-muted group-has-checked:text-ink">{dateRange(o.arrivalMin, o.arrivalMax)}</span>
                  </span>
                </span>
                <span className="shrink-0 text-lg font-bold">{o.total}</span>
              </label>
            ))}
            {selected && (
              <div className="rounded-[var(--radius-sm)] bg-paper-sunk p-4" data-testid="price-lines">
                <dl className="body-s m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 [&_dd]:m-0 [&_dd]:text-right [&_dd]:tabular-nums">
                  {selected.lines.map((l) => (
                    <Fragment key={l.key}>
                      <dt className="min-w-0 break-words">{l.label}</dt>
                      <dd>{l.amount}</dd>
                    </Fragment>
                  ))}
                  <dt className="mt-1 border-t border-line pt-2 font-semibold">Total</dt>
                  <dd className="mt-1 border-t border-line pt-2 font-semibold">{selected.total}</dd>
                </dl>
                <p className="body-s mt-2 text-ink-muted">
                  {selected.tax ? `Includes ${selected.tax} tax.` : "Tax included."}
                  {credits && selected.lines.some((l) => l.key === "credit") && ` The account credit adds ${formatUsd(credits.perBookUsd)} to your account for making more books.`}
                </p>
              </div>
            )}
            {credits && (
              <label className="ss-option group min-w-0" data-testid="use-credits">
                <input type="checkbox" name="useCredits" disabled={credits.redeemableUsd <= 0} defaultChecked={credits.redeemableUsd > 0} className="ss-check mt-0.5 shrink-0" />
                <span className="body-s min-w-0">
                  {credits.redeemableUsd > 0 ? (
                    <>
                      <span className="font-semibold">Use up to ${credits.redeemableUsd.toFixed(2)} of my credits</span>
                      <span className="block text-ink-muted group-has-checked:text-ink">
                        You have ${credits.balanceUsd.toFixed(2)}; ${credits.keepUsd.toFixed(2)} stays in your account for making more books. Buying this book also adds new credits.
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-muted">
                      Credits can pay toward a book when you have more than ${credits.keepUsd.toFixed(2)} (you have ${credits.balanceUsd.toFixed(2)}). Buying this book adds credits.
                    </span>
                  )}
                </span>
              </label>
            )}
            <button formAction={checkoutFormAction} disabled={paying} className="ss-btn ss-btn--primary" data-testid="checkout">
              {paying ? "Opening checkout..." : paymentName === "mock" ? "Continue to test checkout" : "Continue to secure checkout"}
            </button>
            {checkout?.message && (
              <p className="ss-note ss-note--error" role="alert">
                {checkout.message}
              </p>
            )}
          </div>
        )}
      </section>
    </form>
  );
}
