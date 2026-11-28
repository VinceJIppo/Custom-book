import { bookCreditUse } from "@/lib/credits";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { getBookProgress } from "@/lib/books/progress";
import { BookLive } from "@/components/BookLive";
import { isAdminEmail } from "@/lib/admin";
import { StoryReview } from "@/components/StoryReview";
import { pictureSpeedOf } from "@/lib/books/pictures";

export const dynamic = "force-dynamic";

export default async function BookPageRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  if (book.status === "story_review") {
    const pages = book.pages.filter((p) => p.kind === "story").map((p) => ({ id: p.id, storyNumber: p.storyNumber ?? p.index, text: p.text }));
    return (
      <div className="space-y-4">
        <Link href={`/children/${book.childId}`} className="ss-link body-s inline-flex min-h-11 items-center">
          ← {book.child.nickname || book.child.firstName}
        </Link>
        <StoryReview bookId={book.id} title={book.title ?? "Your story"} dedication={book.dedication} pages={pages} speed={pictureSpeedOf(book)} error={(await searchParams).error} />
      </div>
    );
  }
  const creditUse = await bookCreditUse(user.id, book.id);
  const [view, progress] = await Promise.all([book.pages.length ? buildBookView(book) : null, getBookProgress(book.id, (book.options as { length?: number }).length ?? 16, { withProblems: isAdminEmail(user.email) })]);
  return (
    <div className="space-y-4">
      <Link href={`/children/${book.childId}`} className="ss-link body-s inline-flex min-h-11 items-center">
        ← {book.child.nickname || book.child.firstName}
      </Link>
      <BookLive bookId={book.id} initial={{ status: book.status, title: book.title, progress, view }} admin={isAdminEmail(user.email)} />
      {creditUse > 0 && (
        <p className="body-s text-ink-muted" data-testid="book-credit-use">
          This book has used ${creditUse.toFixed(2)} of credits so far. <Link href="/credits" className="ss-link">See your credits</Link>
        </p>
      )}
    </div>
  );
}
