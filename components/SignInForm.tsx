"use client";

import { useActionState } from "react";
import { requestLinkAction, type SignInState } from "@/app/signin/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState | null, FormData>(requestLinkAction, null);
  if (state?.sent) {
    return (
      <div className="space-y-3" data-testid="link-sent">
        <p className="font-semibold">Check your email</p>
        <p className="text-[color:var(--muted)]">
          We sent a sign-in link to <strong>{state.email}</strong>. It works once and expires in 15 minutes. No email? Check your spam folder, or try again.
        </p>
        {state.devLink && (
          <p className="rounded-lg bg-cream p-3 text-sm">
            Development mode (no email service set up), so here is the link:{" "}
            <a href={state.devLink} className="font-semibold text-cobalt underline" data-testid="dev-link">
              open the sign-in link
            </a>
          </p>
        )}
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="text-sm font-semibold">Your email</span>
        <input name="email" type="email" required autoComplete="email" defaultValue={state?.email} className="mt-1 w-full rounded-lg border border-[color:var(--line)] bg-white px-3 py-2" placeholder="you@example.com" />
      </label>
      {state?.message && (
        <p className="text-sm text-red-700" role="alert">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary w-full" data-testid="send-link">
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
      <p className="text-xs text-[color:var(--muted)]">No password needed. New here? The same link creates your account.</p>
    </form>
  );
}
