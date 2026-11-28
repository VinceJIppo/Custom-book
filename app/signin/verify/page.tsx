import { redirect } from "next/navigation";
import { authMode } from "@/lib/auth";
import { verifyLinkAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Opening the emailed link shows a button instead of signing in right away:
 * email scanners open links automatically and would use up a one-time link.
 */
export default async function Verify({ searchParams }: { searchParams: Promise<{ email?: string; token?: string }> }) {
  if (authMode() === "single") redirect("/");
  const { email, token } = await searchParams;
  if (!email || !token) redirect("/signin");
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="ss-card ss-card--piped space-y-5 p-6 text-center sm:p-8">
        {/* Delft wordmark by day; the light (on-ceiling) one at bedtime, where delft would vanish on the night card. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logos/storystar-wordmark.svg" alt="storystar" width={150} height={40} className="mx-auto h-10 w-auto [[data-theme=bedtime]_&]:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={150} height={40} className="mx-auto hidden h-10 w-auto [[data-theme=bedtime]_&]:block" />
        <h1 className="heading">Almost there</h1>
        <p className="break-words text-ink-muted">
          Sign in as <strong className="text-ink">{email}</strong>.
        </p>
        <form action={verifyLinkAction}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="token" value={token} />
          <button className="ss-btn ss-btn--primary ss-btn--block" data-testid="confirm-signin">
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
