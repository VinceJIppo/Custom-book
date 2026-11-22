import Link from "next/link";
import type { CreditSummary } from "@/lib/credits";
import type { Allowance } from "@/lib/allowance";

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Home page summary: credit balance, what's expiring, and the parent's tier. */
export function CreditsCard({ c, a }: { c: CreditSummary; a: Allowance }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:flex-row sm:items-center sm:justify-between" data-testid="credits-card">
      <div>
        <h2 className="font-display text-xl font-medium">
          Credits: <span className={c.balanceUsd < 1 ? "text-coral" : "text-olive"}>${c.balanceUsd.toFixed(2)}</span>
        </h2>
        <p className="mt-1 text-sm text-[color:var(--muted)]">
          Making a book uses credits for the writing and pictures (usually $1 to $3 a book).
          {c.expiringSoonUsd > 0 && c.nextExpiry && ` $${c.expiringSoonUsd.toFixed(2)} expires on ${date(c.nextExpiry)}.`}
          {!a.unlimited && ` Your level: ${a.tier.label}.`}
          {a.next && ` Order ${a.next.ordersNeeded} more printed book${a.next.ordersNeeded === 1 ? "" : "s"} to reach ${a.next.tier.label}.`}
        </p>
      </div>
      <Link href="/credits" className="btn btn-secondary self-start sm:self-auto" data-testid="credits-link">
        Add credits
      </Link>
    </section>
  );
}
