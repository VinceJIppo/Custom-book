import Link from "next/link";
import type { CreditSummary } from "@/lib/credits";
import type { Allowance } from "@/lib/allowance";

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Home page summary: credit balance, what's expiring, and the parent's tier. */
export function CreditsCard({ c, a }: { c: CreditSummary; a: Allowance }) {
  return (
    <section className="ss-card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-testid="credits-card">
      <div className="min-w-0">
        <h2 className="title">
          Credits: <span className={c.balanceUsd < 1 ? "text-persimmon" : "text-delft"}>${c.balanceUsd.toFixed(2)}</span>
        </h2>
        <p className="body-s mt-1 text-ink-muted">
          Making a book uses credits for the writing and pictures (usually $1 to $3 a book).
          {c.expiringSoonUsd > 0 && c.nextExpiry && ` $${c.expiringSoonUsd.toFixed(2)} expires on ${date(c.nextExpiry)}.`}
          {!a.unlimited && ` Your level: ${a.tier.label}.`}
          {a.next && ` Order ${a.next.ordersNeeded} more printed book${a.next.ordersNeeded === 1 ? "" : "s"} to reach ${a.next.tier.label}.`}
        </p>
      </div>
      <Link href="/credits" className="ss-btn ss-btn--secondary ss-btn--sm shrink-0 self-start sm:self-auto" data-testid="credits-link">
        Add credits
      </Link>
    </section>
  );
}
