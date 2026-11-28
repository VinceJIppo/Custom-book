import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { confirmAdultAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Welcome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user.ageConfirmedAt) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="ss-card ss-card--piped p-6 sm:p-8">
        <div className="text-center">
          {/* Delft wordmark by day; the light (on-ceiling) one at bedtime, where delft would vanish on the night card. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark.svg" alt="storystar" width={150} height={40} className="mx-auto h-10 w-auto [[data-theme=bedtime]_&]:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={150} height={40} className="mx-auto hidden h-10 w-auto [[data-theme=bedtime]_&]:block" />
          <h1 className="heading mt-6">Welcome to StoryStar</h1>
          <p className="mt-3 text-ink-muted">
            StoryStar is for parents and family grown-ups. You create the books; your child enjoys reading them with you.
          </p>
        </div>
        <form action={confirmAdultAction} className="mt-6 space-y-4">
          <label className="ss-option">
            <input type="checkbox" name="adult" className="ss-check mt-0.5 shrink-0" required />
            <span>I am 18 or older.</span>
          </label>
          {error && (
            <p className="ss-note ss-note--error" role="alert">
              Please confirm you are 18 or older to continue.
            </p>
          )}
          <button className="ss-btn ss-btn--primary ss-btn--block">Continue</button>
        </form>
      </div>
    </div>
  );
}
