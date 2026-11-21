"use client";

import Link from "next/link";

/** Friendly page for unexpected errors. The technical details stay in the server log (matched by the reference). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl bg-white p-8 text-center ring-1 ring-[color:var(--line)]">
      <p className="font-display text-4xl text-coral">Oops!</p>
      <h1 className="font-display text-2xl font-medium">Something went wrong on our side</h1>
      <p className="text-[color:var(--muted)]">Your books and photos are safe. Please try again; if it keeps happening, wait a few minutes.</p>
      <div className="flex justify-center gap-3">
        <button onClick={() => retry()} className="btn btn-primary">
          Try again
        </button>
        <Link href="/" className="btn btn-secondary">
          Go to my books
        </Link>
      </div>
      {digest && <p className="text-xs text-[color:var(--muted)]">Reference: {digest}</p>}
    </div>
  );
}
