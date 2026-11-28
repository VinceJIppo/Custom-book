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
    <div className="mx-auto w-full max-w-lg">
      <div className="ss-card ss-card--piped space-y-5 p-6 text-center sm:p-8" data-testid="pending">
        {/* Delft wordmark by day; the light (on-ceiling) one at bedtime, where delft would vanish on the night card. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logos/storystar-wordmark.svg" alt="storystar" width={150} height={40} className="mx-auto h-10 w-auto [[data-theme=bedtime]_&]:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={150} height={40} className="mx-auto hidden h-10 w-auto [[data-theme=bedtime]_&]:block" />
        <h1 className="heading">{declined ? "We can't open your account right now" : "Thanks for signing up!"}</h1>
        {declined ? (
          <p className="text-ink-muted">We&apos;re opening StoryStar to a small number of families at a time. If you think this is a mistake, just reply to any of our emails.</p>
        ) : (
          <p className="break-words text-ink-muted">
            We&apos;re welcoming new families a few at a time. Your account (<strong className="text-ink">{user.email}</strong>) is waiting for approval, and we&apos;ll email you as soon as it&apos;s ready, usually within a day.
          </p>
        )}
        <form action={signOutAction}>
          <button className="ss-btn ss-btn--secondary ss-btn--sm">Sign out</button>
        </form>
      </div>
    </div>
  );
}
