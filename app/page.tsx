import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { isAdminEmail } from "@/lib/admin";
import { bookStatusLabel, bookStatusPill } from "@/lib/books/statusLabels";
import { getOptionalUser } from "@/lib/auth";
import { Landing } from "@/components/Landing";
import { Star } from "@/components/brand/Star";
import { bookThumbs, portraits } from "@/lib/books/thumbs";
import { activeProviderNames } from "@/lib/providers/registry";
import { getAllowance } from "@/lib/allowance";
import { PlanCard } from "@/components/PlanCard";
import { CreditsCard } from "@/components/CreditsCard";
import { getCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

/** Monogram fills for children without a character picture (text on them is on-accent). */
const MONO = ["bg-ballet", "bg-buttercup", "bg-sage"];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  // Visitors who aren't signed in see the home page with example books.
  if (!(await getOptionalUser())) return <Landing signedIn={false} startHref="/signin" />;
  const user = await requireOnboardedUser();
  const { deleted } = await searchParams;
  const grownUps = await db.childProfile.findMany({ where: { userId: user.id, kind: "grownup" }, orderBy: { createdAt: "asc" } });
  const children = await db.childProfile.findMany({
    where: { userId: user.id, kind: "child" },
    orderBy: { createdAt: "asc" },
    include: { books: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, createdAt: true, coverImageKey: true } } },
  });
  const providers = activeProviderNames();
  const [allowance, credits, thumbs, faces] = await Promise.all([getAllowance(user.id), getCredits(user.id), bookThumbs(children.flatMap((c) => c.books)), portraits(children)]);

  return (
    <div className="space-y-10">
      {deleted && (
        <p className="ss-note ss-note--success" role="status">
          That child and everything about them has been deleted.
        </p>
      )}

      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3">My bookshelf</p>
          <h1 className="heading flex items-center gap-3">
            Your stars
            <span className="flex items-start gap-1">
              <Star className="h-5 w-5 rotate-[-12deg] text-buttercup" />
              <Star className="h-3 w-3 rotate-[18deg] text-persimmon" />
            </span>
          </h1>
          <p className="mt-2 max-w-md text-ink-muted">Make a picture book where your child is the star, then order a keepsake copy to hold.</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* The one primary action here; on an empty shelf it moves to "Add your first child". */}
          <Link href="/children/new" className={`ss-btn ${children.length ? "ss-btn--primary" : "ss-btn--secondary"}`}>
            Add a child
          </Link>
          <Link href="/examples" className="ss-link inline-flex min-h-11 items-center">
            See examples
          </Link>
        </div>
      </div>

      {credits.enabled ? <CreditsCard c={credits} a={allowance} /> : <PlanCard a={allowance} />}

      {children.length === 0 ? (
        <div className="ss-card ss-card--piped px-6 py-10 text-center sm:py-12">
          <div className="flex items-end justify-center gap-2" aria-hidden="true">
            <Star className="h-4 w-4 rotate-[-18deg] text-persimmon" />
            <Star className="h-8 w-8 rotate-[8deg] text-buttercup" />
            <Star className="h-5 w-5 rotate-[24deg] text-delft" />
          </div>
          <h2 className="title mt-4">No children yet</h2>
          <p className="mx-auto mt-2 max-w-md text-ink-muted">Start by telling us about your child: their name, age and favorite things.</p>
          <Link href="/children/new" className="ss-btn ss-btn--primary mt-6">
            Add your first child
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {children.map((c, ci) => (
            <section key={c.id} className="ss-card ss-card--piped" data-testid="child-shelf">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* The name link stretches over the portrait and details, so the whole block is clickable. */}
                <div className="group relative flex min-w-0 items-center gap-4">
                  <span
                    aria-hidden="true"
                    className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-[1.5px] ring-ballet ring-offset-[3px] ring-offset-paper-raised"
                  >
                    {faces[c.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={faces[c.id]} alt="" className="h-full w-full scale-[1.6] object-cover object-[20%_35%]" />
                    ) : (
                      <span className={`flex h-full w-full items-center justify-center font-display text-2xl text-on-accent ${MONO[ci % MONO.length]}`}>{(c.nickname || c.firstName).slice(0, 1)}</span>
                    )}
                  </span>
                  <div className="min-w-0">
                    <h2 className="title break-words">
                      <Link href={`/children/${c.id}`} className="after:absolute after:inset-0 group-hover:text-delft">
                        {c.nickname || c.firstName}
                      </Link>
                    </h2>
                    <p className="body-s text-ink-muted">
                      Age {c.age} · {c.books.length} {c.books.length === 1 ? "book" : "books"}
                    </p>
                  </div>
                </div>
                <Link href={`/books/new?childId=${c.id}`} className="ss-btn ss-btn--secondary ss-btn--sm">
                  New book
                </Link>
              </div>
              <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
                {c.books.map((b) => (
                  <li key={b.id} className="min-w-0">
                    <Link href={`/books/${b.id}`} className="group block">
                      <span className="relative block transition-transform group-hover:-translate-y-1">
                        <span className="block aspect-square overflow-hidden rounded-[var(--radius-book)] bg-paper-sunk">
                          {thumbs[b.id] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumbs[b.id]} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center p-3 text-center font-display text-sm text-ink-muted">{b.status === "story_review" ? "Story ready to read" : "Painting..."}</span>
                          )}
                        </span>
                        {/* Spine and resting shadow, drawn over the picture. */}
                        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--radius-book)] shadow-book" />
                      </span>
                      <span className="mt-3 block font-display text-[17px] leading-[22px] break-words group-hover:text-delft">{b.title ?? "New story"}</span>
                      <span className={`mt-1.5 ${bookStatusPill(b.status)}`}>{bookStatusLabel(b.status)}</span>
                    </Link>
                  </li>
                ))}
                <li className="min-w-0">
                  <Link
                    href={`/books/new?childId=${c.id}`}
                    className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[var(--radius-book)] border-[1.5px] border-dashed border-delft p-3 text-center text-[15px] font-semibold text-delft transition-colors hover:bg-delft-wash"
                  >
                    <span className="text-2xl leading-none" aria-hidden="true">
                      +
                    </span>
                    {c.books.length ? "Another book" : "Their first book"}
                  </Link>
                </li>
              </ul>
            </section>
          ))}
        </div>
      )}

      <section className="space-y-4" data-testid="grownups">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="title">Family &amp; friends</h2>
            <p className="body-s mt-1 text-ink-muted">Grown-ups who can star in your children&apos;s books: a secret-superhero mom, what Grandpa does at work...</p>
          </div>
          <Link href="/people/new" className="ss-btn ss-btn--secondary ss-btn--sm">
            Add a grown-up
          </Link>
        </div>
        {grownUps.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {grownUps.map((g) => (
              <Link
                key={g.id}
                href={`/children/${g.id}`}
                className="inline-flex min-h-11 max-w-full flex-wrap items-baseline gap-x-2 rounded-[var(--radius-md)] border border-line bg-paper-raised px-4 py-2.5 transition-colors hover:border-delft"
              >
                <span className="font-semibold">{g.nickname || g.firstName}</span> <span className="body-s text-ink-muted">{g.relationship}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {isAdminEmail(user.email) && (
        <p className="body-s text-ink-muted" data-testid="admin-providers">
          Admin only: stories by <b>{providers.story}</b>
          {providers.story !== "mock" && ` (${providers.storyModel})`}, pictures by <b>{providers.image}</b>, printing by <b>{providers.print}</b>.
          {providers.story === "mock" && " Stories use the offline template until an Anthropic key is set."}
        </p>
      )}
    </div>
  );
}
