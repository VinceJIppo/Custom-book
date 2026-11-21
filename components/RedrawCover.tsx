"use client";

import { startTransition, useActionState, useState } from "react";
import { redrawCoverAction } from "@/app/actions";

/** "Redraw the cover", with an optional note for the artist. */
export function RedrawCover({ bookId }: { bookId: string }) {
  const [open, setOpen] = useState(false);
  const [state, redraw, pending] = useActionState(redrawCoverAction, null);
  if (!open)
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)} data-testid="redraw-cover">
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
      className="flex w-full flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-[color:var(--line)] sm:w-auto sm:flex-row sm:items-center">
      <input type="hidden" name="bookId" value={bookId} />
      <input
        name="note"
        maxLength={300}
        placeholder="Optional: what should change? (e.g. show Charlie waving by the stream)"
        className="w-full rounded-lg border border-[color:var(--line)] px-3 py-2 sm:w-80"
        aria-label="What should change on the cover"
        data-testid="redraw-cover-note"
      />
      <div className="flex items-center gap-2">
        <button disabled={pending} className="btn btn-primary btn-sm" data-testid="redraw-cover-submit">
          {pending ? "Starting..." : "Redraw"}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state?.message && (
        <p role="status" className="text-sm text-red-700">
          {state.message}
        </p>
      )}
    </form>
  );
}
