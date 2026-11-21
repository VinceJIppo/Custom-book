import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { FavoritesSchema } from "@/lib/schemas/child";
import { deleteChildAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function ChildPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ deleteError?: string }> }) {
  const user = await requireOnboardedUser();
  const { id } = await params;
  const { deleteError } = await searchParams;
  const child = await db.childProfile.findFirst({ where: { id, userId: user.id }, include: { books: { orderBy: { createdAt: "desc" } } } });
  if (!child) notFound();
  const grownUp = child.kind === "grownup";
  const fav = FavoritesSchema.parse(child.favorites);
  const friends = child.friends as string[];
  // Books this person appears in as a co-star.
  const castIn = (await db.book.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, castSnapshot: true } })).filter(
    (b) => Array.isArray(b.castSnapshot) && (b.castSnapshot as Array<{ id: string }>).some((c) => c.id === child.id),
  );
  const facts: Array<[string, string]> = grownUp
    ? [
        ["Who they are", child.relationship ?? ""],
        ["Pronouns", child.pronouns],
        ["About", child.about ?? ""],
        ["Looks", child.look ?? ""],
      ]
    : [
    ["Age", String(child.age)],
    ["Pronouns", child.pronouns],
    ["Colors", fav.colors.join(", ")],
    ["Animals", fav.animals.join(", ")],
    ["Foods", fav.foods.join(", ")],
    ["Activities", fav.activities.join(", ")],
    ["Pet", child.petName ? `${child.petName}${child.petType ? ` (${child.petType})` : ""}` : ""],
    ["Best friends", friends.join(", ")],
    ["Lesson", child.lesson ?? ""],
      ];
  const books = grownUp ? castIn : [...child.books, ...castIn];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-3xl font-medium">{child.nickname || child.firstName}</h1>
        <div className="flex gap-2">
          <Link href={grownUp ? `/people/${child.id}/edit` : `/children/${child.id}/edit`} className="btn btn-secondary">
            Edit
          </Link>
          <Link href={`/children/${child.id}/character`} className="btn btn-secondary">
            Photos &amp; character
          </Link>
          {!grownUp && (
            <Link href={`/books/new?childId=${child.id}`} className="btn btn-primary">
              New book
            </Link>
          )}
        </div>
      </div>

      <dl className="grid gap-3 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:grid-cols-3">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{k}</dt>
              <dd className="mt-0.5">{v}</dd>
            </div>
          ))}
      </dl>

      <section>
        <h2 className="font-display text-xl font-medium">Books</h2>
        <ul className="mt-3 space-y-2">
          {books.length === 0 && <li className="text-[color:var(--muted)]">{grownUp ? "Not in any books yet. Add them to a child's book in the new-book form." : "No books yet."}</li>}
          {books.map((b) => (
            <li key={b.id}>
              <Link href={`/books/${b.id}`} className="block rounded-xl bg-white px-4 py-3 ring-1 ring-[color:var(--line)] hover:bg-tint">
                {b.title ?? "New story"} <span className="text-sm text-[color:var(--muted)]">· {b.status === "story_review" ? "story ready to read" : b.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl bg-red-50 p-5 ring-1 ring-red-200">
        <h2 className="font-display text-xl font-medium text-red-900">Delete {child.firstName} and everything about them</h2>
        <p className="mt-1 text-sm text-red-900/80">
          This permanently removes this profile, all photos, character art, books and pages from storage and the database. It cannot be undone.
        </p>
        <form action={deleteChildAction} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input type="hidden" name="id" value={child.id} />
          <input name="confirmName" placeholder={`Type "${child.firstName}" to confirm`} className="rounded-xl border border-red-200 bg-white px-3 py-2" autoComplete="off" />
          <button className="btn btn-danger">Delete everything</button>
        </form>
        {deleteError && <p className="mt-2 text-sm text-red-800">The name didn&apos;t match, so nothing was deleted.</p>}
      </section>
    </div>
  );
}
