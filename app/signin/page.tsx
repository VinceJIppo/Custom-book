import { redirect } from "next/navigation";
import { authMode, getOptionalUser } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; signedOut?: string }> }) {
  if (authMode() === "single") redirect("/");
  if (await getOptionalUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="ss-card ss-card--piped space-y-5 p-6 sm:p-8">
        <div className="text-center">
          {/* Delft wordmark by day; the light (on-ceiling) one at bedtime, where delft would vanish on the night card. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark.svg" alt="storystar" width={150} height={40} className="mx-auto h-10 w-auto [[data-theme=bedtime]_&]:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={150} height={40} className="mx-auto hidden h-10 w-auto [[data-theme=bedtime]_&]:block" />
          <p className="eyebrow mt-6">Welcome</p>
          <h1 className="heading mt-2">Sign in to StoryStar</h1>
        </div>
        {sp.signedOut && (
          <p className="ss-note" role="status">
            You&apos;re signed out.
          </p>
        )}
        {sp.error && (
          <p className="ss-note ss-note--warn" role="alert">
            {sp.error}
          </p>
        )}
        <SignInForm />
      </div>
    </div>
  );
}
