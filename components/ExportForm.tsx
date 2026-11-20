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
          <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-lg bg-cream p-3 ring-1 ring-[color:var(--line)] has-[:checked]:bg-tint has-[:checked]:ring-cobalt">
            <input type="radio" name="productId" value={p.id} defaultChecked={i === 0} className="mt-1 accent-[color:var(--color-cobalt)]" />
            <span>
              <span className="block font-semibold">{p.label}</span>
              <span className="text-sm text-[color:var(--muted)]">{p.detail}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending || !!disabled} data-testid="make-print-files" className="btn btn-primary">
          {pending ? "Starting..." : "Make print files"}
        </button>
        {disabled && <span className="text-sm text-amber-800">{disabled}</span>}
        {state?.message && <span role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
