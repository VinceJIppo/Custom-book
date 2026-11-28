import { getConfig } from "@/lib/config";
import { getCredits } from "@/lib/credits";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { orderableExports } from "@/lib/orders/service";
import { ensurePrintFiles } from "@/lib/books/export";
import { AutoRefresh } from "@/components/AutoRefresh";
import { COUNTRIES } from "@/lib/orders/address";
import { activeProviderNames } from "@/lib/providers/registry";
import { OrderForm } from "@/components/OrderForm";

export const dynamic = "force-dynamic";

export default async function OrderBook({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const user = await requireOnboardedUser();
  const credits = await getCredits(user.id);
  const bookId = (await params).id;
  const found = await orderableExports(user.id, bookId);
  const book = found.book;
  let exports = found.exports;
  if (!book) notFound();
  // Hardcover only; the print files are made automatically if they aren't ready yet.
  exports = exports.filter((x) => x.product.binding === "hardcover");
  const files = exports.length ? null : await ensurePrintFiles(user.id, bookId);
  if (files?.state === "ready") exports = (await orderableExports(user.id, bookId)).exports.filter((x) => x.product.binding === "hardcover");
  const sp = await searchParams;
  const providers = activeProviderNames();
  return (
    <div className="space-y-6">
      <Link href={`/books/${book.id}`} className="ss-link body-s inline-flex min-h-11 items-center">
        ← Back to the book
      </Link>
      <div className="min-w-0">
        <h1 className="heading break-words">Order a printed copy of {book.title}</h1>
        <p className="mt-2 text-ink-muted">
          Printed and shipped by {providers.print === "lulu" ? "Lulu" : "the test printer (offline mock)"}. Payment: {providers.payment === "stripe" ? "Stripe (test mode)" : "test checkout (no card needed)"}.
        </p>
      </div>
      {sp.cancelled && (
        <p className="ss-note" role="status">
          Checkout was cancelled. Nothing was charged; you can try again below.
        </p>
      )}
      {exports.length === 0 ? (
        <section className="ss-card" data-testid="needs-print-files">
          <AutoRefresh active={files?.state === "making"} everyMs={3000} />
          {files?.state === "failed" ? (
            <>
              <p className="font-semibold">We couldn&apos;t get the book ready to print yet.</p>
              <p className="mt-1 text-ink-muted">{files.message}</p>
            </>
          ) : (
            <>
              <p className="animate-pulse font-semibold">Getting your book ready for the printer...</p>
              <p className="mt-1 text-ink-muted">This takes about a minute. The page updates on its own.</p>
            </>
          )}
        </section>
      ) : (
        <OrderForm
          bookId={book.id}
          files={exports.map((x) => ({
            exportId: x.export.id,
            label: x.product.label,
            detail: `${x.export.pageCount} pages · ${x.export.validationStatus === "passed" ? "checked by the printer" : "passed our print checks"} · made ${x.export.createdAt.toLocaleDateString()}`,
          }))}
          countries={COUNTRIES}
          paymentName={providers.payment}
          credits={credits.enabled ? { redeemableUsd: credits.redeemableUsd, balanceUsd: credits.balanceUsd, keepUsd: getConfig().CREDIT_REDEEM_KEEP_USD } : undefined}
        />
      )}
    </div>
  );
}
