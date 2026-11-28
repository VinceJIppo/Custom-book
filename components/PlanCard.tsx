import type { Allowance } from "@/lib/allowance";
import { ACTION_LABELS, ALLOWANCE_ACTIONS } from "@/lib/allowance";
import { Star } from "@/components/brand/Star";

/** "Your plan": tier, what's left, and how to unlock more. */
export function PlanCard({ a }: { a: Allowance }) {
  if (a.unlimited) return null;
  const shown = ALLOWANCE_ACTIONS.filter((x) => x !== "theme");
  return (
    <section className="ss-card" data-testid="plan-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="title">
          Your plan: <span className="text-delft">{a.tier.label}</span>
        </h2>
        <span className="body-s text-ink-muted">{a.windowDays ? "Counts the last 30 days" : "Included with your first try"}</span>
      </div>
      <ul className="mt-4 grid gap-4 sm:grid-cols-4">
        {shown.map((x) => {
          const limit = a.limits[x];
          const used = Math.min(a.used[x], limit);
          return (
            <li key={x} className="min-w-0">
              <div className="flex flex-wrap justify-between gap-x-2 text-[15px] leading-[22px]">
                <span>{ACTION_LABELS[x].many[0].toUpperCase() + ACTION_LABELS[x].many.slice(1)}</span>
                <span className="font-semibold">
                  {a.remaining[x]} of {limit} left
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-delft-wash">
                <div className="h-full rounded-full bg-delft" style={{ width: `${limit ? (100 * (limit - used)) / limit : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {a.next && (
        <p className="ss-note mt-5 flex items-start gap-2">
          <Star className="mt-[3px] h-3.5 w-3.5 text-persimmon" />
          <span>
            Order {a.next.ordersNeeded === 1 ? "a printed copy of one of your books" : `${a.next.ordersNeeded} more printed books`} to become a <strong>{a.next.tier.label}</strong>: {a.next.tier.pitch}
          </span>
        </p>
      )}
    </section>
  );
}
