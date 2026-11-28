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
    return <p className="text-ink-muted">Credits aren&apos;t turned on for this app.</p>;
  }

  const packs = creditPacks();

  return (
    <div className="space-y-10">
      <section>
        <p className="eyebrow mb-3">Your credits</p>
        <h1 className="font-display text-4xl font-normal" data-testid="credits-balance">
          {money(c.balanceUsd)}
        </h1>
        <p className="mt-3 max-w-2xl text-ink-muted">
          Credits pay for the AI that writes your stories and paints the pictures, at what it actually costs us. A book usually uses $1 to $3. Every printed book you buy adds ${cfg.CREDIT_PER_BOOK_USD.toFixed(0)}, and credits last {cfg.CREDIT_EXPIRY_MONTHS} months.
        </p>
        {bought != null && (
          <p className="ss-note ss-note--success mt-4" role="status">
            Thank you! ${bought.toFixed(2)} of credits was added.
          </p>
        )}
        {sp.cancelled && (
          <p className="ss-note mt-4" role="status">
            No charge was made.
          </p>
        )}
        {sp.error && (
          <p className="ss-note ss-note--error mt-4" role="alert">
            {sp.error}
          </p>
        )}
      </section>

      <section className="ss-card ss-card--piped">
        <h2 className="title">Add credits</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {packs.map((amount, i) => (
            <form key={amount} action={buyCreditsAction}>
              <input type="hidden" name="amount" value={amount} />
              {/* One primary action per view: the first pack; the others are secondary. */}
              <button className={`ss-btn ${i === 0 ? "ss-btn--primary" : "ss-btn--secondary"}`} data-testid={`buy-${amount}`}>
                Buy ${amount}
              </button>
            </form>
          ))}
        </div>
        <p className="body-s mt-3 text-ink-muted">
          At checkout for a printed book, credits can pay toward it as long as ${cfg.CREDIT_REDEEM_KEEP_USD.toFixed(0)} stays in your account
          {c.redeemableUsd > 0 ? ` (right now up to ${money(c.redeemableUsd)})` : ""}.
        </p>
      </section>

      {c.lots.length > 0 && (
        <section>
          <h2 className="title">When they expire</h2>
          <ul className="mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-paper-raised">
            {c.lots.map((l) => (
              <li key={l.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 px-4 py-3 text-[15px] leading-[22px]">
                <span className="min-w-0">
                  {KIND[l.kind] ?? l.kind} <span className="text-ink-muted">on {date(l.createdAt)}</span>
                </span>
                <span className="min-w-0">
                  <strong>{money(l.remainingUsd)}</strong> <span className="text-ink-muted">left, expires {date(l.expiresAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="title">Levels</h2>
        <p className="body-s mt-1 text-ink-muted">Ordering printed books moves you up a level, with room for more characters and custom themes. You&apos;re at {a.unlimited ? "an admin level (no limits)" : a.tier.label}.</p>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {TIER_IDS.map((id) => {
            const t = TIERS[id];
            const here = !a.unlimited && a.tier.id === id;
            return (
              <li key={id} className={`ss-card min-w-0 p-4 sm:p-5 ${here ? "border-2 border-delft" : ""}`}>
                <h3 className="title">
                  {t.label} {here && <span className="body-s font-sans font-semibold text-delft">(you)</span>}
                </h3>
                <p className="body-s text-ink-muted">{t.minPaidOrders === 0 ? "Everyone starts here" : `After ${t.minPaidOrders} printed book${t.minPaidOrders === 1 ? "" : "s"}`}</p>
                <p className="body-s mt-1">
                  {t.limits.character} character sets and {t.limits.theme} custom theme{t.limits.theme === 1 ? "" : "s"} {t.window === "30d" ? "a month" : "to start"}.
                </p>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="title">History</h2>
        {history.length === 0 ? (
          <p className="mt-1 text-ink-muted">Nothing yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-line bg-paper-raised">
            <table className="w-full text-[15px] leading-[22px]" data-testid="credit-history">
              <tbody className="divide-y divide-line">
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="hidden whitespace-nowrap px-4 py-3 align-top text-ink-muted sm:table-cell">{date(h.createdAt)}</td>
                    <td className="px-4 py-3 align-top sm:min-w-[10rem]">
                      <span className="block text-ink-muted sm:hidden">{date(h.createdAt)}</span>
                      {h.kind === "usage" ? NOTE[(h.note ?? "").replace(" (failed try)", "")] ?? h.note : h.note}
                      {h.note?.endsWith("(failed try)") && <span className="text-ink-muted"> (a try that didn&apos;t finish)</span>}
                      {h.bookId && titles.get(h.bookId) && (
                        <>
                          {" "}
                          <Link href={`/books/${h.bookId}`} className="ss-link">
                            {titles.get(h.bookId)}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-3 text-right align-top font-semibold ${h.amountUsd < 0 ? "" : "text-delft"}`}>{money(Math.round(h.amountUsd * 10000) / 10000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
