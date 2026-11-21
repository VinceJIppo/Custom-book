import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { orderableExports } from "@/lib/orders/service";
import { COUNTRIES } from "@/lib/orders/address";
import { activeProviderNames } from "@/lib/providers/registry";
import { OrderForm } from "@/components/OrderForm";

export const dynamic = "force-dynamic";

export default async function OrderBook({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cancelled?: string }> }) {
  const user = await requireOnboardedUser();
  const { book, exports } = await orderableExports(user.id, (await params).id);
  if (!book) notFound();
  const sp = await searchParams;
  const providers = activeProviderNames();
  return (
    <div className="space-y-6">
      <Link href={`/books/${book.id}`} className="text-sm font-semibold text-cobalt">
        ← Back to the book
      </Link>
      <div>
        <h1 className="font-display text-3xl font-medium">Order a printed copy of {book.title}</h1>
        <p className="text-[color:var(--muted)]">
          Printed and shipped by {providers.print === "lulu" ? "Lulu" : "the test printer (offline mock)"}. Payment: {providers.payment === "stripe" ? "Stripe (test mode)" : "test checkout (no card needed)"}.
        </p>
      </div>
      {sp.cancelled && <p className="rounded-xl bg-sky px-4 py-3 text-navy">Checkout was cancelled. Nothing was charged; you can try again below.</p>}
      {exports.length === 0 ? (
        <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]" data-testid="needs-print-files">
          <p className="font-semibold">First, make the print files.</p>
          <p className="text-[color:var(--muted)]">We only print files that passed the print checks and match the book as it is now.</p>
          <Link href={`/books/${book.id}/print`} className="btn btn-primary mt-3">
            Make print files
          </Link>
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
        />
      )}
    </div>
  );
}
