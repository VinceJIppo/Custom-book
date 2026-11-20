import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { getBookProgress } from "@/lib/books/progress";
import { BookLive } from "@/components/BookLive";

export const dynamic = "force-dynamic";

export default async function BookPageRoute({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  const [view, progress] = await Promise.all([book.pages.length ? buildBookView(book) : null, getBookProgress(book.id, (book.options as { length?: number }).length ?? 16)]);
  return (
    <div className="space-y-4">
      <Link href={`/children/${book.childId}`} className="text-sm font-semibold text-berry">
        ← {book.child.nickname || book.child.firstName}
      </Link>
      <BookLive bookId={book.id} initial={{ status: book.status, title: book.title, progress, view }} />
    </div>
  );
}
