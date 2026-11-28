"use client";

import { startTransition, useActionState } from "react";
import { startExportAction } from "@/app/actions";

export function ExportForm({ bookId, products, disabled }: { bookId: string; products: Array<{ id: string; label: string; detail: string }>; disabled?: string }) {
  const [state, action, pending] = useActionState(startExportAction, null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-3"
    >
      <input type="hidden" name="bookId" value={bookId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {products.map((p, i) => (
          <label key={p.id} className="ss-option group min-w-0">
            <input type="radio" name="productId" value={p.id} defaultChecked={i === 0} className="ss-check mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="block font-semibold">{p.label}</span>
              <span className="body-s text-ink-muted group-has-checked:text-ink">{p.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || !!disabled} data-testid="make-print-files" className="ss-btn ss-btn--primary">
          {pending ? "Starting..." : "Make print files"}
        </button>
        {disabled && <span className="body-s text-ink-muted">{disabled}</span>}
        {state?.message && (
          <span role="status" className={`body-s ${state.ok ? "text-delft" : "text-persimmon"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
