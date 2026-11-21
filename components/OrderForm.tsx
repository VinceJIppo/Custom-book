"use client";

import { useActionState, useState } from "react";
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
}: {
  bookId: string;
  files: Array<{ exportId: string; label: string; detail: string }>;
  countries: Array<[string, string]>;
  paymentName: string;
}) {
  const [quote, quoteFormAction, quoting] = useActionState<OrderFormState | null, FormData>(quoteAction, null);
  const [checkout, checkoutFormAction, paying] = useActionState<OrderFormState | null, FormData>(checkoutAction, null);
  const [v, setV] = useState<Fields>({ name: "", street1: "", street2: "", city: "", stateCode: "", postcode: "", countryCode: "US", phone: "", email: "", giftNote: "" });
  const [exportId, setExportId] = useState(files[0]?.exportId ?? "");
  // Prices belong to the address and files they were quoted for; any change asks for new prices.
  const [quotedFor, setQuotedFor] = useState<string | null>(null);
  const key = JSON.stringify({ ...v, giftNote: "", exportId });
  const fresh = !!quote?.options?.length && quotedFor === key;
  const errors = { ...(quote?.errors ?? {}), ...(checkout?.errors ?? {}) };

  const field = (name: keyof Fields, label: string, opts: { required?: boolean; hint?: string; autoComplete?: string; max?: number; wide?: boolean } = {}) => (
    <label className={`block ${opts.wide ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-semibold">
        {label}
        {!opts.required && <span className="font-normal text-[color:var(--muted)]"> (optional)</span>}
      </span>
      <input
        name={name}
        value={v[name]}
        maxLength={opts.max}
        autoComplete={opts.autoComplete}
        onChange={(e) => setV({ ...v, [name]: e.target.value })}
        aria-invalid={!!errors[name]}
        className="mt-1 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
      />
      {errors[name] ? <span className="text-sm text-red-700">{errors[name]}</span> : opts.hint ? <span className="text-xs text-[color:var(--muted)]">{opts.hint}</span> : null}
    </label>
  );

  return (
    <form className="space-y-6" onSubmit={() => setQuotedFor(key)}>
      <input type="hidden" name="bookId" value={bookId} />

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="mb-3 font-display text-xl font-medium">1. The book</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {files.map((f) => (
            <label key={f.exportId} className="flex cursor-pointer items-start gap-3 rounded-lg bg-cream p-3 ring-1 ring-[color:var(--line)] has-[:checked]:bg-tint has-[:checked]:ring-cobalt">
              <input type="radio" name="exportId" value={f.exportId} checked={exportId === f.exportId} onChange={() => setExportId(f.exportId)} className="mt-1" />
              <span>
                <span className="block font-semibold">{f.label}</span>
                <span className="text-sm text-[color:var(--muted)]">{f.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="mb-1 font-display text-xl font-medium">2. Ship to</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Sending a gift? Enter the recipient&apos;s address. The carrier needs a phone number for delivery.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Recipient's full name", { required: true, autoComplete: "name", max: 35, wide: true })}
          {field("street1", "Street address", { required: true, autoComplete: "address-line1", max: 30, hint: "Up to 30 characters; use line 2 for the rest." })}
          {field("street2", "Apartment, suite, etc.", { autoComplete: "address-line2", max: 30 })}
          {field("city", "City", { required: true, autoComplete: "address-level2", max: 30 })}
          {field("stateCode", "State or province code", { required: v.countryCode === "US" || v.countryCode === "CA" || v.countryCode === "AU" || v.countryCode === "MX", autoComplete: "address-level1", max: 3, hint: "For example CA, NY or NSW." })}
          {field("postcode", "ZIP or postcode", { required: true, autoComplete: "postal-code", max: 20 })}
          <label className="block">
            <span className="text-sm font-semibold">Country</span>
            <select name="countryCode" value={v.countryCode} onChange={(e) => setV({ ...v, countryCode: e.target.value })} className="mt-1 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2">
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
          <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="address-warnings">
            <p className="font-semibold">Please check the address:</p>
            <ul className="list-disc pl-5">
              {quote.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            {quote.suggestion && (
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-2"
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

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="mb-1 font-display text-xl font-medium">3. Gift note</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Saved with the order so you remember who it was for. The printer can&apos;t put notes in the box; to have a message printed inside the book, edit its dedication page before making the print files.
        </p>
        <textarea
          name="giftNote"
          value={v.giftNote}
          maxLength={500}
          rows={3}
          onChange={(e) => setV({ ...v, giftNote: e.target.value })}
          className="w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2"
          placeholder="Happy birthday, Oliver! Love, Grandma"
        />
        {errors.giftNote && <span className="text-sm text-red-700">{errors.giftNote}</span>}
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="mb-3 font-display text-xl font-medium">4. Shipping and price</h2>
        {!fresh && (
          <button formAction={quoteFormAction} disabled={quoting || !exportId} className="btn btn-secondary" data-testid="get-prices">
            {quoting ? "Asking the printer..." : quote?.options?.length ? "Update prices for this address" : "See shipping options"}
          </button>
        )}
        {quote?.message && <p className="mt-3 text-red-700" role="alert">{quote.message}</p>}
        {fresh && (
          <div className="space-y-3" data-testid="shipping-options">
            {quote!.options!.map((o, i) => (
              <label key={o.level} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg bg-cream p-3 ring-1 ring-[color:var(--line)] has-[:checked]:bg-tint has-[:checked]:ring-cobalt">
                <span className="flex items-center gap-3">
                  <input type="radio" name="shippingLevel" value={o.level} defaultChecked={i === 0} />
                  <span>
                    <span className="block font-semibold">{SHIPPING_LABELS[o.level] ?? o.level}</span>
                    <span className="text-sm text-[color:var(--muted)]">{dateRange(o.arrivalMin, o.arrivalMax)}</span>
                  </span>
                </span>
                <span className="font-display text-lg">{o.total}</span>
              </label>
            ))}
            <p className="text-sm text-[color:var(--muted)]">One total per option: printing, shipping and tax included.</p>
            <button formAction={checkoutFormAction} disabled={paying} className="btn btn-primary" data-testid="checkout">
              {paying ? "Opening checkout..." : paymentName === "mock" ? "Continue to test checkout" : "Continue to secure checkout"}
            </button>
            {checkout?.message && <p className="text-red-700" role="alert">{checkout.message}</p>}
          </div>
        )}
      </section>
    </form>
  );
}
