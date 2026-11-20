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
  flagged: ["Check likeness", "bg-amber-100 text-amber-900"],
  pending: ["Drawing...", "bg-sky text-cobalt"],
  failed: ["Picture failed", "bg-red-100 text-red-800"],
};

export default async function EditBook({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  if (!book.pages.length) {
    return (
      <p>
        This book is still being written. <Link href={`/books/${book.id}`} className="text-cobalt underline">Back to the book</Link>
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
          <Link href={`/books/${book.id}`} className="text-sm font-semibold text-cobalt">
            ← Back to the flipbook
          </Link>
          <h1 className="mt-1 font-display text-3xl font-medium">Edit {book.title}</h1>
          <p className="text-[color:var(--muted)]">Tap a page to change its words, picture or layout. Use the arrows to reorder.</p>
        </div>
      </div>
      {view.warnings.length > 0 && (
        <ul className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
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
            <li key={p.id} className="overflow-hidden rounded-lg bg-white ring-1 ring-[color:var(--line)]" data-testid="edit-page-card">
              <Link href={`/books/${book.id}/pages/${p.id}`} className="block">
                {pv && <BookPage page={pv} book={view} mode="screen" />}
              </Link>
              <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <Link href={`/books/${book.id}/pages/${p.id}`} className="font-semibold hover:text-cobalt">
                  Page {p.storyNumber}
                  {p.layout === "spread" && " (spread)"}
                </Link>
                {badge && <span className={`btn btn-secondary btn-sm ${badge[1]}`}>{badge[0]}</span>}
                <span className="flex gap-1">
                  {(["up", "down"] as const).map((d) => (
                    <form key={d} action={movePageAction}>
                      <input type="hidden" name="bookId" value={book.id} />
                      <input type="hidden" name="pageId" value={p.id} />
                      <input type="hidden" name="direction" value={d} />
                      <button
                        disabled={(d === "up" && i === 0) || (d === "down" && i === story.length - 1)}
                        className="btn btn-secondary btn-sm"
                        aria-label={d === "up" ? `Move page ${p.storyNumber} earlier` : `Move page ${p.storyNumber} later`}
                      >
                        {d === "up" ? "◀" : "▶"}
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
