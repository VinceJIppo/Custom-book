import { HAIR_LENGTHS, type HairLength } from "@/lib/schemas/child";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { FavoritesSchema } from "@/lib/schemas/child";
import { deleteChildAction } from "@/app/actions";
import { bookStatusLabel, bookStatusPill } from "@/lib/books/statusLabels";

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
        ["Male or female", child.pronouns === "he" ? "Male" : child.pronouns === "she" ? "Female" : "Not set"],
        ["Hair length", child.hairLength && child.hairLength in HAIR_LENGTHS ? HAIR_LENGTHS[child.hairLength as HairLength].label : ""],
        ["About", child.about ?? ""],
        ["Looks", child.look ?? ""],
      ]
    : [
    ["Age", String(child.age)],
    ["Male or female", child.pronouns === "he" ? "Male" : child.pronouns === "she" ? "Female" : "Not set"],
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="heading min-w-0 break-words">{child.nickname || child.firstName}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href={grownUp ? `/people/${child.id}/edit` : `/children/${child.id}/edit`} className="ss-btn ss-btn--secondary ss-btn--sm">
            Edit
          </Link>
          <Link href={`/children/${child.id}/character`} className={grownUp ? "ss-btn ss-btn--primary ss-btn--sm" : "ss-btn ss-btn--secondary ss-btn--sm"}>
            Photos &amp; character
          </Link>
          {!grownUp && (
            <Link href={`/books/new?childId=${child.id}`} className="ss-btn ss-btn--primary ss-btn--sm">
              New book
            </Link>
          )}
        </div>
      </div>

      <dl className="ss-card ss-card--piped grid gap-4 sm:grid-cols-3">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="body-s font-semibold text-ink-muted">{k}</dt>
              <dd className="mt-0.5 break-words">{v}</dd>
            </div>
          ))}
      </dl>

      <section>
        <h2 className="title">Books</h2>
        <ul className="mt-3 space-y-2">
          {books.length === 0 && <li className="text-ink-muted">{grownUp ? "Not in any books yet. Add them to a child's book in the new-book form." : "No books yet."}</li>}
          {books.map((b) => (
            <li key={b.id}>
              <Link
                href={`/books/${b.id}`}
                className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-paper-raised px-4 py-3 ring-1 ring-line hover:bg-paper-sunk"
              >
                <span className="min-w-0 break-words font-display">{b.title ?? "New story"}</span>
                <span className={bookStatusPill(b.status)}>{bookStatusLabel(b.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="ss-card ss-card--sunk">
        <h2 className="title">Delete {child.firstName} and everything about them</h2>
        <p className="body-s mt-1 text-ink-muted">
          This permanently removes this profile, all photos, character art, books and pages from storage and the database. It cannot be undone.
        </p>
        <form action={deleteChildAction} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="hidden" name="id" value={child.id} />
          <input
            name="confirmName"
            placeholder={`Type "${child.firstName}" to confirm`}
            aria-label={`Type ${child.firstName} to confirm`}
            className="ss-input min-w-0 sm:max-w-xs"
            autoComplete="off"
          />
          <button className="ss-btn ss-btn--danger">Delete everything</button>
        </form>
        {deleteError && (
          <p className="ss-note ss-note--error mt-3" role="alert">
            The name didn&apos;t match, so nothing was deleted.
          </p>
        )}
      </section>
    </div>
  );
}
