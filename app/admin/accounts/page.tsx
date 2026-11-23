import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { approvalRequired, pendingAccounts } from "@/lib/accounts/approval";
import { decideAccountAction } from "./actions";

export const dynamic = "force-dynamic";

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
      <span>
        <span className="font-semibold">{a.email}</span>
        <span className="block text-sm text-[color:var(--muted)]">signed up {a.createdAt.toLocaleString()}</span>
      </span>
      <form action={decideAccountAction} className="flex gap-2">
        <input type="hidden" name="userId" value={a.id} />
        <button name="decision" value="approve" className="btn btn-primary btn-sm" data-testid={`approve-${a.email}`}>
          Approve
        </button>
        {a.approval === "pending" && (
          <button name="decision" value="decline" className="btn btn-secondary btn-sm">
            Decline
          </button>
        )}
      </form>
    </li>
  );
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-medium">New accounts</h1>
        <Link href="/admin/users" className="text-sm font-semibold text-cobalt underline">
          All customers
        </Link>
      </div>
      {!approvalRequired() && <p className="bg-amber-50 px-4 py-2 text-amber-900 ring-1 ring-amber-200">Approval is off (NEW_ACCOUNT_APPROVAL=false): new accounts are approved automatically.</p>}
      {sp.done && <p className="bg-emerald-50 px-4 py-2 text-emerald-900 ring-1 ring-emerald-200">Done. Approved accounts get their welcome credits and an email.</p>}
      {sp.error && <p className="bg-red-50 px-4 py-2 text-red-900 ring-1 ring-red-200">{sp.error}</p>}
      <section>
        <h2 className="font-display text-xl font-medium">Waiting ({waiting.length})</h2>
        {waiting.length ? <ul className="mt-2 divide-y divide-[color:var(--line)] bg-white ring-1 ring-[color:var(--line)]">{waiting.map((a) => <Row key={a.id} a={a} />)}</ul> : <p className="text-[color:var(--muted)]">No one is waiting.</p>}
      </section>
      {declined.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-medium">Declined</h2>
          <ul className="mt-2 divide-y divide-[color:var(--line)] bg-white ring-1 ring-[color:var(--line)]">{declined.map((a) => <Row key={a.id} a={a} />)}</ul>
        </section>
      )}
    </div>
  );
}
