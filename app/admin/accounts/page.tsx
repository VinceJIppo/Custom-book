import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { approvalRequired, pendingAccounts } from "@/lib/accounts/approval";
import { decideAccountAction } from "./actions";

export const dynamic = "force-dynamic";

const LIST = "mt-3 divide-y divide-line overflow-hidden rounded-[var(--radius-md)] border border-line bg-paper-raised";

/** New accounts waiting for approval (and ones you declined, in case you change your mind). */
export default async function AdminAccounts({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireOnboardedUser();
  if (!isAdminEmail(me.email)) notFound();
  const sp = await searchParams;
  const accounts = await pendingAccounts();
  const waiting = accounts.filter((a) => a.approval === "pending");
  const declined = accounts.filter((a) => a.approval === "rejected");
  const Row = ({ a }: { a: (typeof accounts)[number] }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <span className="min-w-0 break-words">
        <span className="font-semibold">{a.email}</span>
        <span className="block text-sm text-ink-muted">signed up {a.createdAt.toLocaleString()}</span>
      </span>
      <form action={decideAccountAction} className="flex flex-wrap gap-2">
        <input type="hidden" name="userId" value={a.id} />
        <button name="decision" value="approve" className="ss-btn ss-btn--secondary ss-btn--sm" data-testid={`approve-${a.email}`}>
          Approve
        </button>
        {a.approval === "pending" && (
          <button name="decision" value="decline" className="ss-btn ss-btn--danger ss-btn--sm">
            Decline
          </button>
        )}
      </form>
    </li>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="heading">New accounts</h1>
        <Link href="/admin/users" className="ss-link body-s inline-flex min-h-11 items-center">
          All customers
        </Link>
      </div>
      {!approvalRequired() && <p className="ss-note ss-note--warn">Approval is off, so new accounts are approved automatically. To review them first, set <code className="break-all">NEW_ACCOUNT_APPROVAL</code> to true.</p>}
      {sp.done && <p className="ss-note ss-note--success" role="status">Done. Approved accounts get their welcome credits and an email.</p>}
      {sp.error && (
        <p className="ss-note ss-note--error" role="alert">
          {sp.error}
        </p>
      )}
      <section>
        <h2 className="title">Waiting ({waiting.length})</h2>
        {waiting.length ? <ul className={LIST}>{waiting.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="mt-2 text-ink-muted">No one is waiting.</p>}
      </section>
      {declined.length > 0 && (
        <section>
          <h2 className="title">Declined</h2>
          <ul className={LIST}>{declined.map((a) => <Row key={a.id} a={a} />)}</ul>
        </section>
      )}
    </div>
  );
}
