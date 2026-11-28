"use client";

import { startTransition, useActionState, useState } from "react";
import { redrawCoverAction } from "@/app/actions";

/** "Redraw the cover", with an optional note for the artist. */
export function RedrawCover({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false);
  const [state, redraw, pending] = useActionState(redrawCoverAction, null);
  if (!open)
    return (
      <button type="button" className="ss-btn ss-btn--secondary" onClick={() => setOpen(true)} data-testid="redraw-cover">
        Redraw the cover
      </button>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => redraw(fd));
      }}
      className="flex w-full min-w-0 flex-col gap-2 rounded-[var(--radius-md)] bg-paper-raised p-3 ring-1 ring-line sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      <input type="hidden" name="bookId" value={bookId} />
      <input
        name="note"
        maxLength={300}
        placeholder="Optional: what should change? (e.g. show Charlie waving by the stream)"
        className="ss-input min-w-0 sm:w-80"
        aria-label="What should change on the cover"
        data-testid="redraw-cover-note"
      />
      <div className="flex items-center gap-2">
        {/* Secondary: "Order a printed copy" stays the one primary action on the book page. */}
        <button disabled={pending} className="ss-btn ss-btn--secondary ss-btn--sm" data-testid="redraw-cover-submit">
          {pending ? "Starting..." : "Redraw"}
        </button>
        <button type="button" className="ss-link inline-flex min-h-11 cursor-pointer items-center px-2 text-[15px]" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state?.message && (
        <p role="status" className="ss-note ss-note--error">
          {state.message}
        </p>
      )}
    </form>
  );
}
