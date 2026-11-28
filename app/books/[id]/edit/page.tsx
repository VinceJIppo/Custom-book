import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { BookPage } from "@/components/book/BookPage";
import { movePageAction } from "@/app/actions";
import { AutoRefresh } from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

const BADGE: Record<string, [string, string]> = {
  flagged: ["Check picture", "ss-pill--attention"],
  pending: ["Drawing...", "ss-pill--working"],
  failed: ["Picture failed", "ss-pill--attention"],
};

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

export default async function EditBook({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  if (!book.pages.length) {
    return (
      <p>
        This book is still being written. <Link href={`/books/${book.id}`} className="ss-link">Back to the book</Link>
      </p>
    );
  }
  const view = await buildBookView(book);
  const story = book.pages.filter((p) => p.kind === "story").sort((a, b) => a.index - b.index);
  const busy = story.some((p) => p.imageStatus === "pending");

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} everyMs={3000} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={`/books/${book.id}`} className="ss-link body-s inline-flex min-h-11 items-center">
            ← Back to the flipbook
          </Link>
          <h1 className="heading mt-1 min-w-0 break-words">Edit {book.title}</h1>
          <p className="mt-2 text-ink-muted">Tap a page to change its words, picture or layout. Use the arrows to reorder.</p>
        </div>
      </div>
      {view.warnings.length > 0 && (
        <ul className="ss-note ss-note--warn space-y-1">
          {view.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {story.map((p, i) => {
          const pv = view.pages.find((x) => x.pageId === p.id && x.half !== "right");
          const badge = BADGE[p.imageStatus];
          return (
            <li key={p.id} className="ss-card min-w-0 p-3" data-testid="edit-page-card">
              <Link href={`/books/${book.id}/pages/${p.id}`} className="block overflow-hidden rounded-[var(--radius-book)] ring-1 ring-line">
                {pv && <BookPage page={pv} book={view} mode="screen" />}
              </Link>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link href={`/books/${book.id}/pages/${p.id}`} className="inline-flex min-h-11 items-center font-semibold hover:text-delft hover:underline">
                  Page {p.storyNumber}
                  {p.layout === "spread" && " (spread)"}
                </Link>
                {badge && <span className={`ss-pill ${badge[1]}`}>{badge[0]}</span>}
                <span className="flex gap-1">
                  {(["up", "down"] as const).map((d) => (
                    <form key={d} action={movePageAction}>
                      <input type="hidden" name="bookId" value={book.id} />
                      <input type="hidden" name="pageId" value={p.id} />
                      <input type="hidden" name="direction" value={d} />
                      <button
                        disabled={(d === "up" && i === 0) || (d === "down" && i === story.length - 1)}
                        className="ss-btn ss-btn--secondary ss-btn--sm w-11 px-0"
                        aria-label={d === "up" ? `Move page ${p.storyNumber} earlier` : `Move page ${p.storyNumber} later`}
                      >
                        <Chevron dir={d === "up" ? "left" : "right"} />
                      </button>
                    </form>
                  ))}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
