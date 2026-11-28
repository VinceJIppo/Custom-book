import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { BookPage } from "@/components/book/BookPage";

export const dynamic = "force-dynamic";

/**
 * Interior pages at physical size with bleed. Phase 3 renders this route to the
 * interior PDF with Playwright; open it in a browser now to inspect print layout.
 */
export default async function PrintInterior({ params }: { params: Promise<{ bookId: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).bookId);
  if (!book || !book.pages.length) notFound();
  const view = await buildBookView(book);
  return (
    <div className="print-root flex flex-col items-center gap-6 bg-paper-sunk py-6 print:block print:bg-paper-raised print:p-0">
      {view.pages.map((p) => (
        <div key={p.number} className="shadow-lg print:shadow-none">
          <BookPage page={p} book={view} mode="print" />
        </div>
      ))}
    </div>
  );
}
