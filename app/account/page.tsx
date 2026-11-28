import Link from "next/link";
import { redirect } from "next/navigation";
import { getOptionalUser, authMode } from "@/lib/auth";
import { getCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { deletionBlockers, type DeletionBlocker } from "@/lib/accounts/deleteAccount";
import { isApproved } from "@/lib/accounts/approval";
import { deleteAccountAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your account | StoryStar" };

const ERRORS: Record<string, string> = {
  open_orders: "One of your print orders isn't finished yet, so your account can't be deleted yet.",
  payment_went_through: "A payment you started has just gone through, so nothing was deleted. Check your orders and credits, then try again.",
  payment_processing: "A payment you started is still being processed by your bank, so nothing was deleted. You can delete your account once it clears.",
  payment_service: "We couldn't reach the payment service to cancel an unfinished checkout, so nothing was deleted. Please try again in a few minutes.",
  retry: "Something changed while we were deleting, so we stopped. Please try again.",
  not_found: "This account was not found. It may already be deleted.",
};
const MISMATCH = "The email address didn't match, so nothing was deleted.";

/** Why an unfinished order holds up the delete, in plain words. */
function blockerNote(b: DeletionBlocker) {
  if (b.status === "shipped") return "on its way; you can delete your account once it's delivered";
  if (b.status === "rejected" || b.status === "failed") return "needs a fix first: open it to send it to the printer again, or write to us at [CONTACT EMAIL] for a refund";
  return "with the printer";
}

/** The parent's account: who they're signed in as, and deleting the account. */
export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Accounts still waiting for approval can see this page (and delete themselves) too.
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  const { error } = await searchParams;
  const approved = isApproved(user);
  const [blockers, credits, people, books, paidOrders, paidPacks] = await Promise.all([
    deletionBlockers(user.id),
    approved ? getCredits(user.id).catch(() => null) : null,
    db.childProfile.count({ where: { userId: user.id } }),
    db.book.count({ where: { userId: user.id } }),
    db.order.count({ where: { userId: user.id, paidAt: { not: null } } }),
    db.creditPurchase.count({ where: { userId: user.id, paidAt: { not: null } } }),
  ]);
  const balance = credits?.enabled ? credits.balanceUsd : 0;
  const emailLinks = authMode() === "email";
  // Only known codes are shown (a made-up ?error= value shows nothing).
  const topError = typeof error === "string" && Object.hasOwn(ERRORS, error) ? ERRORS[error] : null;
  const mismatch = error === "mismatch";

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="eyebrow">Your account</p>
        <h1 className="heading mt-1">Account</h1>
      </header>

      <section className="ss-card ss-card--piped space-y-2">
        <h2 className="title">Signed in as</h2>
        <p className="break-words font-semibold" data-testid="account-email">
          {user.email}
        </p>
        {emailLinks && <p className="body-s text-ink-muted">You sign in with a link we email to this address. There&apos;s no password to remember.</p>}
        <p className="body-s flex flex-wrap gap-x-5">
          {approved && (
            <Link href="/orders" className="ss-link inline-flex min-h-11 items-center">
              Your orders
            </Link>
          )}
          {credits?.enabled && (
            <Link href="/credits" className="ss-link inline-flex min-h-11 items-center">
              Credits
            </Link>
          )}
          <Link href="/photo-privacy" className="ss-link inline-flex min-h-11 items-center">
            How we handle photos
          </Link>
        </p>
      </section>

      <section id="delete" className="ss-card scroll-mt-6 space-y-4" aria-labelledby="delete-heading">
        <h2 id="delete-heading" className="title">
          Delete your account
        </h2>

        {topError && (
          <p className="ss-note ss-note--error" role="alert">
            {topError}
          </p>
        )}

        <div className="body-s space-y-3">
          <p>
            This erases everything you&apos;ve made with StoryStar, straight away. <strong className="font-semibold">It can&apos;t be undone.</strong>
          </p>
          <div>
            <p className="label">What we delete</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              <li>
                Every child and grown-up you added ({people}), with all their photos and characters
              </li>
              <li>Every book ({books}), with its pages, pictures and print files</li>
              <li>Your custom themes, your sign-in details and your email address</li>
              {credits?.enabled && <li>Your credits{balance > 0 ? ` ($${balance.toFixed(2)} left, which will be lost)` : ""}</li>}
            </ul>
          </div>
          <div>
            <p className="label">What we keep</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {paidOrders > 0 && (
                <li>
                  A record of your {paidOrders === 1 ? "paid print order" : `${paidOrders} paid print orders`} (book title, recipient&apos;s name, shipping address and amount) for our accounts, with no email or phone
                  attached
                </li>
              )}
              {paidPacks > 0 && <li>A record of the credits you bought (amount and date) for our accounts</li>}
              {paidOrders === 0 && paidPacks === 0 && <li>Records of any payments you make, for our accounts, with no email attached</li>}
              <li>
                A scrambled, one-way copy of your email address and a count of how many books and characters you made, so a new account with the same address doesn&apos;t get the welcome credits or free
                trial again
              </li>
            </ul>
          </div>
          <p className="text-ink-muted">
            Our printer and payment provider keep their own records of past orders and payments under their own policies.{" "}
            <Link href="/photo-privacy#deleting" className="ss-link">
              More about deleting
            </Link>
          </p>
        </div>

        {blockers.length > 0 ? (
          <div className="ss-note ss-note--warn space-y-2" data-testid="delete-blocked">
            <p>You can delete your account once {blockers.length === 1 ? "this print order is" : "these print orders are"} finished:</p>
            <ul className="list-disc space-y-1 pl-5">
              {blockers.map((b) => (
                <li key={b.orderId}>
                  <Link href={`/orders/${b.orderId}`} className="ss-link">
                    {b.title}
                  </Link>
                  : {blockerNote(b)}.
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <form action={deleteAccountAction} className="space-y-3" data-testid="delete-account-form">
            <label className="block">
              <span className="label break-words">
                Type <span className="font-semibold">{user.email}</span> to confirm
              </span>
              <input
                name="confirmEmail"
                type="email"
                required
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={mismatch || undefined}
                aria-describedby={mismatch ? "confirm-email-error" : undefined}
                className="ss-input mt-1"
                data-testid="confirm-email"
              />
            </label>
            {mismatch && (
              <p id="confirm-email-error" className="ss-note ss-note--error" role="alert">
                {MISMATCH}
              </p>
            )}
            <button className="ss-btn ss-btn--danger" data-testid="delete-account">
              Delete my account
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
