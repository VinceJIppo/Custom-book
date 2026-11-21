import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { getBookProgress } from "@/lib/books/progress";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalUser();
  if (!user) return NextResponse.json({ error: "Signed out" }, { status: 401 });
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [progress, view] = await Promise.all([getBookProgress(book.id, (book.options as { length?: number }).length ?? 16, { withProblems: isAdminEmail(user.email) }), book.pages.length ? buildBookView(book) : null]);
  return NextResponse.json({ status: book.status, title: book.title, progress, view }, { headers: { "Cache-Control": "no-store" } });
}
