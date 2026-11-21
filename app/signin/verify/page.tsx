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
    <div className="mx-auto max-w-md space-y-5 rounded-2xl bg-white p-8 ring-1 ring-[color:var(--line)]">
      <h1 className="font-display text-3xl font-medium">Almost there</h1>
      <p className="text-[color:var(--muted)]">
        Sign in as <strong>{email}</strong>.
      </p>
      <form action={verifyLinkAction}>
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="token" value={token} />
        <button className="btn btn-primary w-full" data-testid="confirm-signin">
          Sign in
        </button>
      </form>
    </div>
  );
}
