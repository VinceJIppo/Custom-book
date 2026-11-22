import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { creditHistory, creditPacks, getCredits } from "@/lib/credits";
import { fulfillCreditPurchase } from "@/lib/credits/purchase";
import { getAllowance, TIERS, TIER_IDS } from "@/lib/allowance";
import { getConfig } from "@/lib/config";
import { db } from "@/lib/db";
import { buyCreditsAction } from "@/app/actions";

export const dynamic = "force-dynamic";

const date = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const money = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const KIND: Record<string, string> = { signup: "Welcome credits", order: "From a book order", purchase: "Bought", admin: "Added by StoryStar", refund: "Refund" };
const NOTE: Record<string, string> = {
  "book.outline": "Planning a story",
  "book.pages": "Writing a story",
  "page.illustrate": "Painting a picture",
  "page.edit": "Changing a picture",
  "book.cover": "Painting a cover",
  "character.sheet": "Drawing character options",
  "character.bible": "Describing a character",
  "page.revise": "Rewriting words",
  "theme.draft": "Designing a theme",
  "photo.check": "Checking a photo",
  "moderation.check": "Checking your words",
  "book.artdirect": "Planning the pictures",
};

export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ session_id?: string; bought?: string; cancelled?: string; error?: string }> }) {
  const user = await requireOnboardedUser();
  const sp = await searchParams;
  if (sp.session_id) {
    // Confirm the payment, then reload so the balance in the header is up to date too.
    const p = await fulfillCreditPurchase(sp.session_id);
    redirect(p && p.userId === user.id && p.status === "paid" ? `/credits?bought=${p.amountUsd}` : "/credits");
  }
  const bought = sp.bought && Number.isFinite(Number(sp.bought)) ? Number(sp.bought) : null;
  const cfg = getConfig();
  const [c, a, history] = await Promise.all([getCredits(user.id), getAllowance(user.id), creditHistory(user.id)]);
  const bookIds = [...new Set(history.map((h) => h.bookId).filter((x): x is string => !!x))];
  const titles = new Map((await db.book.findMany({ where: { id: { in: bookIds }, userId: user.id }, select: { id: true, title: true } })).map((b) => [b.id, b.title ?? "Untitled book"]));

  if (!c.enabled) {
    return <p className="text-[color:var(--muted)]">Credits aren&apos;t turned on for this app.</p>;
  }

  return (
    <div className="space-y-8">
      <section>
        <p className="eyebrow text-coral">Your credits</p>
        <h1 className="font-display text-4xl font-medium" data-testid="credits-balance">
          {money(c.balanceUsd)}
        </h1>
        <p className="mt-2 max-w-2xl text-[color:var(--muted)]">
          Credits pay for the AI that writes your stories and paints the pictures, at what it actually costs us. A book usually uses $1 to $3. Every printed book you buy adds ${cfg.CREDIT_PER_BOOK_USD.toFixed(0)}, and credits last {cfg.CREDIT_EXPIRY_MONTHS} months.
        </p>
        {bought != null && <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-2 text-emerald-900 ring-1 ring-emerald-200">Thank you! ${bought.toFixed(2)} of credits was added.</p>}
        {sp.cancelled && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-2 text-amber-900 ring-1 ring-amber-200">No charge was made.</p>}
        {sp.error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-red-900 ring-1 ring-red-200">{sp.error}</p>}
      </section>

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="font-display text-xl font-medium">Add credits</h2>
        <div className="mt-3 flex flex-wrap gap-3">
          {creditPacks().map((amount) => (
            <form key={amount} action={buyCreditsAction}>
              <input type="hidden" name="amount" value={amount} />
              <button className="btn btn-primary" data-testid={`buy-${amount}`}>
                Buy ${amount}
              </button>
            </form>
          ))}
        </div>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          At checkout for a printed book, credits can pay toward it as long as ${cfg.CREDIT_REDEEM_KEEP_USD.toFixed(0)} stays in your account
          {c.redeemableUsd > 0 ? ` (right now up to ${money(c.redeemableUsd)})` : ""}.
        </p>
      </section>

      {c.lots.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-medium">When they expire</h2>
          <ul className="mt-2 divide-y divide-[color:var(--line)] rounded-xl bg-white ring-1 ring-[color:var(--line)]">
            {c.lots.map((l) => (
              <li key={l.id} className="flex justify-between gap-3 px-4 py-2 text-sm">
                <span>
                  {KIND[l.kind] ?? l.kind} <span className="text-[color:var(--muted)]">on {date(l.createdAt)}</span>
                </span>
                <span>
                  <strong>{money(l.remainingUsd)}</strong> <span className="text-[color:var(--muted)]">left, expires {date(l.expiresAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="font-display text-xl font-medium">Levels</h2>
        <p className="text-sm text-[color:var(--muted)]">Ordering printed books moves you up a level, with room for more characters and custom themes. You&apos;re at {a.unlimited ? "an admin level (no limits)" : a.tier.label}.</p>
        <ul className="mt-2 grid gap-3 sm:grid-cols-3">
          {TIER_IDS.map((id) => {
            const t = TIERS[id];
            const here = !a.unlimited && a.tier.id === id;
            return (
              <li key={id} className={`rounded-xl bg-white p-4 ring-1 ${here ? "ring-2 ring-cobalt" : "ring-[color:var(--line)]"}`}>
                <p className="font-semibold">
                  {t.label} {here && <span className="text-sm text-cobalt">(you)</span>}
                </p>
                <p className="text-sm text-[color:var(--muted)]">{t.minPaidOrders === 0 ? "Everyone starts here" : `After ${t.minPaidOrders} printed book${t.minPaidOrders === 1 ? "" : "s"}`}</p>
                <p className="mt-1 text-sm">
                  {t.limits.character} character sets and {t.limits.theme} custom theme{t.limits.theme === 1 ? "" : "s"} {t.window === "30d" ? "a month" : "to start"}.
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-medium">History</h2>
        {history.length === 0 ? (
          <p className="text-[color:var(--muted)]">Nothing yet.</p>
        ) : (
          <table className="mt-2 w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-[color:var(--line)]" data-testid="credit-history">
            <tbody className="divide-y divide-[color:var(--line)]">
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-[color:var(--muted)]">{date(h.createdAt)}</td>
                  <td className="px-4 py-2">
                    {h.kind === "usage" ? NOTE[(h.note ?? "").replace(" (failed try)", "")] ?? h.note : h.note}
                    {h.note?.endsWith("(failed try)") && <span className="text-[color:var(--muted)]"> (a try that didn&apos;t finish)</span>}
                    {h.bookId && titles.get(h.bookId) && (
                      <>
                        {" "}
                        <Link href={`/books/${h.bookId}`} className="text-cobalt underline">
                          {titles.get(h.bookId)}
                        </Link>
                      </>
                    )}
                  </td>
                  <td className={`whitespace-nowrap px-4 py-2 text-right font-semibold ${h.amountUsd < 0 ? "" : "text-olive"}`}>{money(Math.round(h.amountUsd * 10000) / 10000)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
