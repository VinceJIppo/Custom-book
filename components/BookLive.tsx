"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Flipbook } from "@/components/flipbook/Flipbook";
import { retryBookAction } from "@/app/actions";
import type { BookView } from "@/lib/books/viewTypes";
import type { BookProgress, StepState } from "@/lib/books/progress";

interface LiveState {
  status: string;
  title: string | null;
  progress: BookProgress;
  view: BookView | null;
}

const ICON: Record<StepState, string> = { waiting: "○", working: "◐", done: "●", failed: "✕" };
const COLOR: Record<StepState, string> = { waiting: "text-neutral-400", working: "text-amber-500 animate-pulse", done: "text-emerald-600", failed: "text-red-600" };

/** Polls the book's status while it is being generated, then shows the flipbook. */
export function BookLive({ bookId, initial }: { bookId: string; initial: LiveState }) {
  const [state, setState] = useState(initial);
  const generating = state.status === "generating";

  useEffect(() => {
    if (!generating) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/books/${bookId}/status`, { cache: "no-store" });
        if (res.ok && !stop) setState(await res.json());
      } catch {
        /* network blip; try again next tick */
      }
    };
    const id = setInterval(tick, 1500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [bookId, generating]);

  const p = state.progress;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold" data-testid="book-title">
          {state.title ?? "Writing your story..."}
        </h1>
        {state.view && (
          <p className="text-sm text-[color:var(--muted)]">
            {state.view.themeName} · {state.view.pages.length} printed pages ·{" "}
            <Link href={`/print/${bookId}`} className="underline" target="_blank">
              print layout preview
            </Link>
            {!generating && (
              <>
                {" · "}
                <Link href={`/books/${bookId}/edit`} className="font-semibold text-berry underline" data-testid="edit-pages">
                  Edit pages
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {(generating || state.status === "failed" || p.failedJobs > 0) && (
        <div className="rounded-3xl bg-white p-5 ring-1 ring-[color:var(--line)]" data-testid="progress">
          <div className="h-2 overflow-hidden rounded-full bg-violet-100">
            <div className="h-full rounded-full bg-berry transition-all duration-700" style={{ width: `${p.percent}%` }} />
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {p.steps.map((s) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className={COLOR[s.state]} aria-hidden>
                  {ICON[s.state]}
                </span>
                <span className="font-semibold">{s.label}</span>
                {s.detail && <span className="text-sm text-[color:var(--muted)]">{s.detail}</span>}
              </li>
            ))}
          </ul>
          {(state.status === "failed" || p.failedJobs > 0) && !generating && (
            <form action={retryBookAction} className="mt-4 flex items-center gap-3">
              <input type="hidden" name="bookId" value={bookId} />
              <p className="text-sm text-red-800">Something didn&apos;t finish. Only the missing parts will be redone.</p>
              <button className="rounded-full bg-berry px-4 py-2 text-sm font-semibold text-white">Try again</button>
            </form>
          )}
          <p className="mt-3 text-xs text-[color:var(--muted)]">You can leave this page; the book keeps going in the background. Spent so far: ${p.costUsd.toFixed(4)}</p>
        </div>
      )}

      {state.view && state.view.pages.some((p) => p.imageStatus === "flagged") && (
        <p className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          Some pictures may not match {state.view.childName}&apos;s character exactly.{" "}
          <Link href={`/books/${bookId}/edit`} className="font-semibold underline">
            Review them
          </Link>
        </p>
      )}

      {state.view ? (
        <>
          {state.view.warnings.length > 0 && (
            <ul className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
              {state.view.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <Flipbook book={state.view} />
        </>
      ) : (
        generating && <p className="text-center text-[color:var(--muted)]">The flipbook appears as soon as the pages are written.</p>
      )}
    </div>
  );
}
