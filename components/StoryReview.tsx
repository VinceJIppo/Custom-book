"use client";

import { startTransition, useActionState, useState } from "react";
import { approveStoryAction, changeStoryAction, reviewReviseAction, reviewTextAction, undoStoryChangeAction, type EditState } from "@/app/actions";

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
  const [editing, setEditing] = useState(false);
  return (
    <li className="rounded-xl bg-white p-4 ring-1 ring-[color:var(--line)]" data-testid={`review-page-${page.storyNumber}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">Page {page.storyNumber}</p>
        {!editing && (
          <button type="button" className="text-sm font-semibold text-cobalt underline" onClick={() => setEditing(true)} data-testid={`edit-page-${page.storyNumber}`}>
            Edit
          </button>
        )}
      </div>
      {!editing && <p className="mt-2 whitespace-pre-line font-display text-lg">{page.text}</p>}
      {editing && (
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
      )}
      {editing && asking && (
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

const IDEAS = ["Make it shorter", "Make it funnier", "Simpler words", "A gentler ending", "More about the pet", "Make it rhyme", "Give the grown-ups a bigger part", "A different problem to solve"];

/** Rewrite the whole story or some pages from the parent's notes, with an Undo. */
function ChangeStory({ bookId, pageCount }: { bookId: string; pageCount: number }) {
  const [state, change, changing] = useActionState(changeStoryAction, null);
  const [undone, undo, undoing] = useActionState(undoStoryChangeAction, null);
  const [scope, setScope] = useState<"all" | "pages">("pages");
  const [note, setNote] = useState("");
  const numbers = Array.from({ length: pageCount }, (_, i) => i + 1);
  const undoTag = state?.ok ? state.undoTag : undefined;
  return (
    <details className="space-y-3 rounded-xl bg-sky p-5 ring-1 ring-[color:var(--line)]" data-testid="change-story">
      <summary className="cursor-pointer font-display text-xl font-medium">Change something</summary>
      <p className="mt-2 text-sm text-[color:var(--muted)]">Tell us what to change and on which pages, or ask for a fresh version of the whole story.</p>
      <form onSubmit={submitWith(change)} className="space-y-3">
        <input type="hidden" name="bookId" value={bookId} />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="pages" checked={scope === "pages"} onChange={() => setScope("pages")} />
            <span className="font-semibold">Some pages</span>
          </label>
          {scope === "pages" && (
            <span className="flex items-center gap-2 text-sm">
              from
              <select name="from" defaultValue={1} className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1" aria-label="From page" data-testid="change-from">
                {numbers.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
              to
              <select name="to" defaultValue={Math.min(3, pageCount)} className="rounded-lg border border-[color:var(--line)] bg-white px-2 py-1" aria-label="To page" data-testid="change-to">
                {numbers.map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </span>
          )}
          <label className="flex items-center gap-2">
            <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} data-testid="change-all" />
            <span className="font-semibold">The whole story</span> <span className="text-sm text-[color:var(--muted)]">a fresh version from your notes</span>
          </label>
        </div>
        <label className="block">
          <span className="sr-only">What would you like to change?</span>
          <textarea
            name="instruction"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            maxLength={600}
            placeholder={scope === "all" ? "What should be different? For example: set it at the beach, and let Grandpa save the day." : "What should change on these pages? For example: Pip should be braver here."}
            className={input}
            data-testid="change-note"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {IDEAS.map((idea) => (
            <button type="button" key={idea} onClick={() => setNote((n) => (n ? `${n}. ${idea}` : idea))} className="rounded-full bg-white px-3 py-1 text-sm ring-1 ring-[color:var(--line)] hover:ring-cobalt">
              {idea}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={changing || !note.trim()} className="btn btn-primary btn-sm" data-testid="change-submit">
            {changing ? (scope === "all" ? "Starting over..." : "Rewriting... this takes about a minute") : scope === "all" ? "Rewrite the whole story" : "Rewrite these pages"}
          </button>
          <Status state={state} />
        </div>
      </form>
      {undoTag && (
        <form onSubmit={submitWith(undo)} className="flex items-center gap-3">
          <input type="hidden" name="bookId" value={bookId} />
          <input type="hidden" name="undoTag" value={undoTag} />
          <button disabled={undoing} className="btn btn-secondary btn-sm" data-testid="change-undo">
            {undoing ? "Undoing..." : "Undo that change"}
          </button>
          <Status state={undone} />
        </form>
      )}
      <p className="text-xs text-[color:var(--muted)]">Each rewrite uses one of your AI rewrites. Nothing is drawn until you approve the story.</p>
    </details>
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
          Read it through. Tap Edit on any page to change the words, or use Change something below. When it reads right, we&apos;ll paint the pictures to match.
        </p>
        {dedication && <p className="mt-2 italic text-[color:var(--muted)]">Dedication: {dedication}</p>}
      </div>

      <ol className="space-y-3">
        {pages.map((p) => (
          <PageCard key={p.id} bookId={bookId} page={p} />
        ))}
      </ol>

      <ChangeStory bookId={bookId} pageCount={pages.length} />

      <form action={approveStoryAction} onSubmit={() => setApproving(true)} className="sticky bottom-3 space-y-3 rounded-xl bg-white p-5 shadow-lg ring-1 ring-[color:var(--line)]">
        <input type="hidden" name="bookId" value={bookId} />
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        <input type="hidden" name="pictureSpeed" value={choice} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button disabled={approving} className="btn btn-primary btn-lg w-full sm:w-auto" data-testid="approve-story">
            {approving ? "Starting the pictures..." : "Looks good, draw the pictures"}
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={choice === "overnight"} onChange={(e) => setChoice(e.currentTarget.checked ? "overnight" : "now")} data-testid="review-speed-overnight" />
            <span>
              No rush: draw overnight for about half the cost <span className="text-[color:var(--muted)]">(ready within a day)</span>
            </span>
          </label>
        </div>
        <p className="text-xs text-[color:var(--muted)]">{choice === "now" ? "Pictures take about 10 to 20 minutes." : "We'll email you when the book is ready."}</p>
      </form>
    </div>
  );
}
