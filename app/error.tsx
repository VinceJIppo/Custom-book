"use client";

import Link from "next/link";
import { Star } from "@/components/brand/Star";

/** Friendly page for unexpected errors. The technical details stay in the server log (matched by the reference). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <div className="ss-card mx-auto w-full max-w-md space-y-4 p-6 text-center sm:p-8">
      <div className="flex items-end justify-center gap-2" aria-hidden="true">
        <Star className="h-4 w-4 rotate-[-18deg] text-delft" />
        <Star className="h-7 w-7 rotate-[8deg] text-buttercup" />
        <Star className="h-4 w-4 rotate-[24deg] text-persimmon" />
      </div>
      <p className="font-display text-4xl text-delft">Oops!</p>
      <h1 className="heading">Something went wrong on our side</h1>
      <p className="text-ink-muted">Your books and photos are safe. Please try again; if it keeps happening, wait a few minutes.</p>
      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={() => retry()} className="ss-btn ss-btn--primary">
          Try again
        </button>
        <Link href="/" className="ss-btn ss-btn--secondary">
          Go to my books
        </Link>
      </div>
      {digest && <p className="break-words text-xs text-ink-muted">Reference: {digest}</p>}
    </div>
  );
}
