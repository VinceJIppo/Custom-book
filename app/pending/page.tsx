import { redirect } from "next/navigation";
import { getOptionalUser } from "@/lib/auth";
import { isApproved } from "@/lib/accounts/approval";
import { signOutAction } from "@/app/signin/actions";

export const dynamic = "force-dynamic";

/** Where new accounts wait until an admin approves them. */
export default async function PendingPage() {
  const user = await getOptionalUser();
  if (!user) redirect("/signin");
  if (isApproved(user)) redirect("/");
  const declined = user.approval === "rejected";
  return (
    <div className="mx-auto max-w-lg space-y-5 bg-white p-8 text-center ring-1 ring-[color:var(--line)] pipe-sun" data-testid="pending">
      <p className="text-4xl" aria-hidden>
        {declined ? "✉️" : "⏳"}
      </p>
      <h1 className="font-display text-3xl font-medium">{declined ? "We can't open your account right now" : "Thanks for signing up!"}</h1>
      {declined ? (
        <p className="text-[color:var(--muted)]">We&apos;re opening StoryStar to a small number of families at a time. If you think this is a mistake, just reply to any of our emails.</p>
      ) : (
        <p className="text-[color:var(--muted)]">
          We&apos;re welcoming new families a few at a time. Your account (<strong>{user.email}</strong>) is waiting for approval, and we&apos;ll email you as soon as it&apos;s ready, usually within a day.
        </p>
      )}
      <form action={signOutAction}>
        <button className="btn btn-secondary btn-sm">Sign out</button>
      </form>
    </div>
  );
}
