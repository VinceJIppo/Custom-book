import type { Allowance } from "@/lib/allowance";
import { ACTION_LABELS, ALLOWANCE_ACTIONS } from "@/lib/allowance";

/** "Your plan": tier, what's left, and how to unlock more. */
export function PlanCard({ a }: { a: Allowance }) {
  if (a.unlimited) return null;
  const shown = ALLOWANCE_ACTIONS.filter((x) => x !== "theme");
  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]" data-testid="plan-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-xl font-medium">
          Your plan: <span className="text-coral">{a.tier.label}</span>
        </h2>
        <span className="text-sm text-[color:var(--muted)]">{a.windowDays ? "Counts the last 30 days" : "Included with your first try"}</span>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-4">
        {shown.map((x) => {
          const limit = a.limits[x];
          const used = Math.min(a.used[x], limit);
          return (
            <li key={x}>
              <div className="flex justify-between text-sm">
                <span>{ACTION_LABELS[x].many[0].toUpperCase() + ACTION_LABELS[x].many.slice(1)}</span>
                <span className="font-semibold">
                  {a.remaining[x]} of {limit} left
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-sky">
                <div className="h-full rounded-full bg-cobalt" style={{ width: `${limit ? (100 * (limit - used)) / limit : 0}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
      {a.next && (
        <p className="mt-4 rounded-lg bg-cream p-3 text-sm">
          ★ Order {a.next.ordersNeeded === 1 ? "a printed copy of one of your books" : `${a.next.ordersNeeded} more printed books`} to become a <strong>{a.next.tier.label}</strong>: {a.next.tier.pitch}
        </p>
      )}
    </section>
  );
}
