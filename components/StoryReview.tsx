"use client";

import { startTransition, useActionState, useState } from "react";
import { approveStoryAction, reviewReviseAction, reviewTextAction, type EditState } from "@/app/actions";

export interface ReviewPage {
  id: string;
  storyNumber: number;
  text: string;
}

const input = "w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

function Status({ state }: { state: EditState | null }) {
  if (!state?.message) return null;
  return (
    <span role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
      {state.message}
    </span>
  );
}

function submitWith(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function PageCard({ bookId, page }: { bookId: string; page: ReviewPage }) {
  const [saved, save, saving] = useActionState(reviewTextAction, null);
  const [revised, revise, revising] = useActionState(reviewReviseAction, null);
  const [asking, setAsking] = useState(false);
  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-[color:var(--line)]" data-testid={`review-page-${page.storyNumber}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Page {page.storyNumber}</p>
      <form onSubmit={submitWith(save)} className="mt-2 space-y-2" key={page.text}>
        <input type="hidden" name="bookId" value={bookId} />
        <input type="hidden" name="pageId" value={page.id} />
        <label className="sr-only" htmlFor={`text-${page.id}`}>
          Words on page {page.storyNumber}
        </label>
        <textarea id={`text-${page.id}`} name="text" defaultValue={page.text} rows={3} maxLength={900} className={`${input} font-display text-lg`} />
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={saving} className="btn btn-secondary btn-sm">
            {saving ? "Saving..." : "Save"}
          </button>
          <button type="button" className="text-sm font-semibold text-cobalt underline" onClick={() => setAsking((v) => !v)}>
            Ask for a rewrite
          </button>
          <Status state={saved} />
        </div>
      </form>
      {asking && (
        <form onSubmit={submitWith(revise)} className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="bookId" value={bookId} />
          <input type="hidden" name="pageId" value={page.id} />
          <input name="instruction" maxLength={300} placeholder="make it shorter, mention Grandma, make it rhyme" className={input} aria-label={`What to change on page ${page.storyNumber}`} />
          <button disabled={revising} className="btn btn-secondary btn-sm shrink-0">
            {revising ? "Rewriting..." : "Rewrite"}
          </button>
          <Status state={revised} />
        </form>
      )}
    </li>
  );
}

/** The parent reads the whole story and fixes any words before a single picture is drawn. */
export function StoryReview({ bookId, title, dedication, pages, speed, error }: { bookId: string; title: string; dedication: string | null; pages: ReviewPage[]; speed: "now" | "overnight"; error?: string }) {
  const [choice, setChoice] = useState(speed);
  const [approving, setApproving] = useState(false);
  return (
    <div className="space-y-6" data-testid="story-review">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-coral">Step 1 of 2: read your story</p>
        <h1 className="font-display text-3xl font-medium" data-testid="book-title">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-[color:var(--muted)]">
          Read it through and change any words you like. Nothing has been drawn yet, so changes are free. When it reads right, approve it and we&apos;ll paint the pictures to match.
        </p>
        {dedication && <p className="mt-2 italic text-[color:var(--muted)]">Dedication: {dedication}</p>}
      </div>

      <ol className="space-y-3">
        {pages.map((p) => (
          <PageCard key={p.id} bookId={bookId} page={p} />
        ))}
      </ol>

      <form action={approveStoryAction} onSubmit={() => setApproving(true)} className="sticky bottom-3 space-y-3 rounded-xl bg-white p-5 shadow-lg ring-1 ring-[color:var(--line)]">
        <input type="hidden" name="bookId" value={bookId} />
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <fieldset className="flex flex-col gap-2 sm:flex-row sm:gap-6">
          <legend className="sr-only">When should we draw the pictures?</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="pictureSpeed" value="now" checked={choice === "now"} onChange={() => setChoice("now")} />
            <span>
              <span className="font-semibold">Right away</span> <span className="text-sm text-[color:var(--muted)]">about 10 to 20 minutes</span>
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="pictureSpeed" value="overnight" checked={choice === "overnight"} onChange={() => setChoice("overnight")} data-testid="review-speed-overnight" />
            <span>
              <span className="font-semibold">Overnight</span> <span className="text-sm text-[color:var(--muted)]">about half the cost, within a day</span>
            </span>
          </label>
        </fieldset>
        <button disabled={approving} className="btn btn-primary btn-lg w-full sm:w-auto" data-testid="approve-story">
          {approving ? "Starting the pictures..." : "The story looks good. Draw the pictures"}
        </button>
      </form>
    </div>
  );
}
