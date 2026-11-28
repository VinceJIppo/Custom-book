import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { listVersions } from "@/lib/books/pages";
import { BookPage } from "@/components/book/BookPage";
import { ArtEditor, LayoutEditor, TextEditor } from "@/components/PageEditorForms";
import { AutoRefresh } from "@/components/AutoRefresh";
import { acceptFlaggedAction, restoreVersionAction } from "@/app/actions";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d={dir === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/** A history note in plain words: story rewrites carry an internal undo tag, which stays hidden. */
function historyLabel(note: string | null) {
  if (!note) return "a change";
  return note.replace(/^Story rewrite [a-z0-9]+/, "Story rewrite");
}

export default async function EditPage({ params }: { params: Promise<{ id: string; pageId: string }> }) {
  const user = await requireOnboardedUser();
  const { id, pageId } = await params;
  const book = await getBookForUser(user.id, id);
  const page = book?.pages.find((p) => p.id === pageId);
  if (!book || !page) notFound();
  const view = await buildBookView(book);
  const physical = view.pages.filter((p) => p.pageId === page.id);
  const versions = await listVersions(user.id, page.id);
  const story = book.pages.filter((p) => p.kind === "story").sort((a, b) => a.index - b.index);
  const pos = story.findIndex((p) => p.id === page.id);
  const prev = story[pos - 1];
  const next = story[pos + 1];
  const pending = page.imageStatus === "pending";
  const lastJob = await db.generationJob.findFirst({ where: { pageId: page.id }, orderBy: { createdAt: "desc" }, select: { status: true, error: true } });
  const issues = (page.qaIssues as string[] | null) ?? [];
  const likenessIssues = issues.filter((i) => !i.startsWith("Story: ")).map((i) => i.replace(/^Likeness: /, ""));
  const storyIssues = issues.filter((i) => i.startsWith("Story: ")).map((i) => i.slice(7));

  return (
    <div className="space-y-6">
      <AutoRefresh active={pending} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/books/${book.id}/edit`} className="ss-link body-s inline-flex min-h-11 items-center">
          ← All pages
        </Link>
        <div className="flex flex-wrap gap-2">
          {prev && (
            <Link href={`/books/${book.id}/pages/${prev.id}`} className="ss-btn ss-btn--secondary ss-btn--sm gap-1 pl-3">
              <Chevron dir="left" /> Page {prev.storyNumber}
            </Link>
          )}
          {next && (
            <Link href={`/books/${book.id}/pages/${next.id}`} className="ss-btn ss-btn--secondary ss-btn--sm gap-1 pr-3">
              Page {next.storyNumber} <Chevron dir="right" />
            </Link>
          )}
        </div>
      </div>
      <h1 className="heading first-letter:uppercase">{page.kind === "story" ? `Page ${page.storyNumber}` : page.kind}</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div className={`grid gap-0 overflow-hidden rounded-[var(--radius-book)] shadow-lift ring-1 ring-line ${physical.length > 1 ? "grid-cols-2" : ""}`}>
            {physical.map((p) => (
              <BookPage key={p.number} page={p} book={view} mode="screen" />
            ))}
          </div>
          {pending && <p className="animate-pulse text-sm font-semibold text-delft">Drawing a new picture for this page...</p>}
          {!pending && lastJob?.status === "failed" && <p className="ss-note ss-note--error break-words">The last picture change didn&apos;t work: {lastJob.error}. Your previous picture is kept.</p>}
          {page.imageStatus === "flagged" && (
            <div className="ss-note ss-note--warn" data-testid="flagged">
              <p className="font-semibold">
                {storyIssues.length && !likenessIssues.length
                  ? "This picture may not match the words on the page."
                  : storyIssues.length
                    ? "This picture may not match the words, and the hero may not look quite like the character sheet."
                    : "The hero may not look quite like the character sheet here."}
              </p>
              {storyIssues.length > 0 && <p>The words say: {storyIssues.join("; ")}.</p>}
              {likenessIssues.length > 0 && <p>Likeness: {likenessIssues.join("; ")}.</p>}
              <p className="mt-1">Change or redraw the picture, or keep it if it looks right to you.</p>
              <form action={acceptFlaggedAction} className="mt-3">
                <input type="hidden" name="bookId" value={book.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <button className="ss-btn ss-btn--secondary ss-btn--sm">Keep this picture</button>
              </form>
            </div>
          )}
          {page.scene != null && (
            <p className="text-xs text-ink-muted">Scene: {(page.scene as { action?: string }).action}</p>
          )}
        </div>

        <div className="space-y-6">
          <section className="ss-card ss-card--piped">
            <TextEditor bookId={book.id} pageId={page.id} text={page.text} />
          </section>
          {page.kind === "story" && (
            <>
              <section className="ss-card">
                <ArtEditor bookId={book.id} pageId={page.id} busy={pending} hasImage={!!page.imageKey} />
              </section>
              <section className="ss-card">
                <LayoutEditor bookId={book.id} pageId={page.id} layout={page.layout} textZone={page.textZone} />
              </section>
            </>
          )}
          {versions.length > 0 && (
            <section className="ss-card">
              <h2 className="title">History</h2>
              <ul className="body-s mt-3 space-y-3" data-testid="history">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 break-words">
                      <span className="block">
                        Version {v.version}, before: {historyLabel(v.note)}
                      </span>
                      <span className="block text-ink-muted">{v.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                    <form action={restoreVersionAction} className="shrink-0">
                      <input type="hidden" name="bookId" value={book.id} />
                      <input type="hidden" name="pageId" value={page.id} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <button className="ss-btn ss-btn--secondary ss-btn--sm">Restore</button>
                    </form>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
