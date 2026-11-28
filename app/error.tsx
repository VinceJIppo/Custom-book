"use client";

import Link from "next/link";
import { unstable_isUnrecognizedActionError } from "next/navigation";
import { Star } from "@/components/brand/Star";

/**
 * A form on a page opened before StoryStar was redeployed points at the old server code, so the
 * new server can't find it. Nothing is wrong with the person's data; reloading the page fixes it.
 */
function isStalePage(error: unknown) {
  if (unstable_isUnrecognizedActionError(error)) return true;
  const e = error as { name?: string; message?: string } | null;
  return e?.name === "UnrecognizedActionError" || /Server Action .* was not found on the server/.test(e?.message ?? "");
}

/** Friendly page for unexpected errors. The technical details stay in the server log (matched by the reference). */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  const stale = isStalePage(error);
  return (
    <div className="ss-card mx-auto w-full max-w-md space-y-4 p-6 text-center sm:p-8" data-testid={stale ? "error-stale-page" : "error-page"}>
      <div className="flex items-end justify-center gap-2" aria-hidden="true">
        <Star className="h-4 w-4 rotate-[-18deg] text-delft" />
        <Star className="h-7 w-7 rotate-[8deg] text-buttercup" />
        <Star className="h-4 w-4 rotate-[24deg] text-persimmon" />
      </div>
      {stale ? (
        <>
          <h1 className="heading">StoryStar was just updated</h1>
          <p className="text-ink-muted">We made an update while this page was open, so it needs a fresh start. Reload the page and try again. Your books and photos are safe.</p>
        </>
      ) : (
        <>
          <p className="font-display text-4xl text-delft">Oops!</p>
          <h1 className="heading">Something went wrong on our side</h1>
          <p className="text-ink-muted">Your books and photos are safe. Please try again; if it keeps happening, wait a few minutes.</p>
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <button onClick={() => (stale ? window.location.reload() : retry())} className="ss-btn ss-btn--primary">
          {stale ? "Reload page" : "Try again"}
        </button>
        <Link href="/" className="ss-btn ss-btn--secondary">
          Go to my books
        </Link>
      </div>
      {digest && <p className="break-words text-xs text-ink-muted">Reference: {digest}</p>}
    </div>
  );
}
