"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flipbook } from "@/components/flipbook/Flipbook";
import { retryBookAction } from "@/app/actions";
import { RedrawCover } from "@/components/RedrawCover";
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
export function BookLive({ bookId, initial, admin = false }: { bookId: string; initial: LiveState; admin?: boolean }) {
  const [state, setState] = useState(initial);
  const generating = state.status === "generating";
  const router = useRouter();
  // The words are written: show the story review screen.
  useEffect(() => {
    if (state.status === "story_review") router.refresh();
  }, [state.status, router]);

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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-medium" data-testid="book-title">
            {state.title ?? "Planning your story..."}
          </h1>
          {generating && p.premise && <p className="max-w-2xl italic text-[color:var(--muted)]" data-testid="book-premise">{p.premise}</p>}
          {state.view && (
            <p className="text-sm text-[color:var(--muted)]">
              {state.view.themeName} · {state.view.voiceLabel} voice · {state.view.pages.length} printed pages ·{" "}
              <Link href={`/print/${bookId}`} className="underline" target="_blank">
                print layout preview
              </Link>
            </p>
          )}
        </div>
        {state.view && !generating && (
          <div className="flex flex-wrap items-center gap-3">
            <Link href={`/books/${bookId}/edit`} className="btn btn-secondary" data-testid="edit-pages">
              Edit pages
            </Link>
            {admin && (
              <Link href={`/books/${bookId}/print`} className="btn btn-secondary" data-testid="print-files">
                Print files
              </Link>
            )}
            <RedrawCover bookId={bookId} />
            <Link href={`/books/${bookId}/order`} className="btn btn-order order-first w-full sm:order-none sm:w-auto" data-testid="order-book">
              <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" />
                <path d="M4 19a2 2 0 0 1 2-2h13" />
              </svg>
              Order a printed copy
            </Link>
          </div>
        )}
      </div>

      {(generating || state.status === "failed" || p.failedJobs > 0) && (
        <div className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]" data-testid="progress">
          <div className="h-2 overflow-hidden rounded-full bg-sky">
            <div className="h-full rounded-full bg-cobalt transition-all duration-700" style={{ width: `${p.percent}%` }} />
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
              <button className="btn btn-primary btn-sm">Try again</button>
            </form>
          )}
          {!generating && p.problems && p.problems.length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="failure-details">
              <p className="font-semibold">Why it stopped (only admins see this)</p>
              {p.problems.map((x, i) => (
                <div key={i}>
                  <p>
                    {x.hint} {x.count > 1 && <span className="text-amber-800/80">({x.count} times)</span>}
                  </p>
                  <p className="mt-0.5 break-words font-mono text-xs text-amber-800/80">{x.detail}</p>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-[color:var(--muted)]">
            {p.phase === "story"
              ? "Writing a story usually takes about 2 minutes. You can leave this page; we'll email you when it's ready to read."
              : p.overnight
                ? "Overnight pictures are drawn in Google's slower, cheaper queue. You can close this page; we'll email you when the book is ready."
                : "You can leave this page; the book keeps going in the background."}{" "}
            Spent so far: ${p.costUsd.toFixed(4)}
          </p>
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
