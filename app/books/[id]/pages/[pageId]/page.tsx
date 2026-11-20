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

  return (
    <div className="space-y-6">
      <AutoRefresh active={pending} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/books/${book.id}/edit`} className="text-sm font-semibold text-berry">
          ← All pages
        </Link>
        <div className="flex gap-2 text-sm font-semibold">
          {prev && (
            <Link href={`/books/${book.id}/pages/${prev.id}`} className="rounded-full bg-white px-3 py-1 ring-1 ring-[color:var(--line)]">
              ◀ Page {prev.storyNumber}
            </Link>
          )}
          {next && (
            <Link href={`/books/${book.id}/pages/${next.id}`} className="rounded-full bg-white px-3 py-1 ring-1 ring-[color:var(--line)]">
              Page {next.storyNumber} ▶
            </Link>
          )}
        </div>
      </div>
      <h1 className="font-display text-3xl font-semibold">{page.kind === "story" ? `Page ${page.storyNumber}` : page.kind}</h1>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div className={`grid gap-0 overflow-hidden rounded-2xl shadow ring-1 ring-black/10 ${physical.length > 1 ? "grid-cols-2" : ""}`}>
            {physical.map((p) => (
              <BookPage key={p.number} page={p} book={view} mode="screen" />
            ))}
          </div>
          {pending && <p className="animate-pulse text-sm text-berry">Drawing a new picture for this page...</p>}
          {!pending && lastJob?.status === "failed" && <p className="text-sm text-red-700">The last picture change didn&apos;t work: {lastJob.error}. Your previous picture is kept.</p>}
          {page.imageStatus === "flagged" && (
            <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-testid="flagged">
              <p className="font-semibold">The hero may not look quite like the character sheet here.</p>
              {issues.length > 0 && <p>Noticed: {issues.join("; ")}.</p>}
              <p className="mt-1">Change or redraw the picture, or keep it if it looks right to you.</p>
              <form action={acceptFlaggedAction} className="mt-2">
                <input type="hidden" name="bookId" value={book.id} />
                <input type="hidden" name="pageId" value={page.id} />
                <button className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-amber-300">Looks fine, keep it</button>
              </form>
            </div>
          )}
          {page.scene != null && (
            <p className="text-xs text-[color:var(--muted)]">Scene: {(page.scene as { action?: string }).action}</p>
          )}
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl bg-white p-4 ring-1 ring-[color:var(--line)]">
            <TextEditor bookId={book.id} pageId={page.id} text={page.text} />
          </section>
          {page.kind === "story" && (
            <>
              <section className="rounded-2xl bg-white p-4 ring-1 ring-[color:var(--line)]">
                <ArtEditor bookId={book.id} pageId={page.id} busy={pending} hasImage={!!page.imageKey} />
              </section>
              <section className="rounded-2xl bg-white p-4 ring-1 ring-[color:var(--line)]">
                <LayoutEditor bookId={book.id} pageId={page.id} layout={page.layout} textZone={page.textZone} />
              </section>
            </>
          )}
          {versions.length > 0 && (
            <section className="rounded-2xl bg-white p-4 ring-1 ring-[color:var(--line)]">
              <p className="font-semibold">History</p>
              <ul className="mt-2 space-y-1 text-sm" data-testid="history">
                {versions.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      v{v.version}, before: {v.note ?? "change"} · <span className="text-[color:var(--muted)]">{v.createdAt.toLocaleString()}</span>
                    </span>
                    <form action={restoreVersionAction}>
                      <input type="hidden" name="bookId" value={book.id} />
                      <input type="hidden" name="pageId" value={page.id} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <button className="rounded-full bg-cream px-3 py-0.5 font-semibold ring-1 ring-[color:var(--line)]">Restore</button>
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
