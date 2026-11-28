"use client";

import { useActionState } from "react";
import { requestLinkAction, type SignInState } from "@/app/signin/actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState | null, FormData>(requestLinkAction, null);
  if (state?.sent) {
    return (
      <div className="space-y-3" data-testid="link-sent">
        <p className="title">Check your email</p>
        <p className="break-words text-ink-muted">
          We sent a sign-in link to <strong className="text-ink">{state.email}</strong>. It works once and expires in 15 minutes. No email? Check your spam folder, or try again.
        </p>
        {state.devLink && (
          <p className="ss-note">
            Development mode (no email service set up), so here is the link:{" "}
            <a href={state.devLink} className="ss-link" data-testid="dev-link">
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
        <input name="email" type="email" required autoComplete="email" defaultValue={state?.email} className="ss-input mt-1" placeholder="you@example.com" />
      </label>
      {state?.message && (
        <p className="ss-note ss-note--error" role="alert">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="ss-btn ss-btn--primary ss-btn--block" data-testid="send-link">
        {pending ? "Sending..." : "Email me a sign-in link"}
      </button>
      <p className="text-center text-sm text-ink-muted">No password needed. New here? The same link creates your account.</p>
    </form>
  );
}
