import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { getOptionalUser } from "@/lib/auth";
import { Landing } from "@/components/Landing";
import { ScrollBand } from "@/components/ScrollBand";
import { bookThumbs, portraits } from "@/lib/books/thumbs";
import { activeProviderNames } from "@/lib/providers/registry";
import { getAllowance } from "@/lib/allowance";
import { PlanCard } from "@/components/PlanCard";
import { CreditsCard } from "@/components/CreditsCard";
import { getCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

const PILL: Record<string, string> = {
  ready: "bg-olive/15 text-olive",
  story_review: "bg-cobalt/10 text-cobalt",
  generating: "bg-amber-100 text-amber-800 animate-pulse",
  failed: "bg-coral/15 text-coral",
};
const PIPES = ["pipe-pink", "pipe-blue", "pipe-olive", "pipe-sun"];
const RINGS = ["ring-pink/40", "ring-bluebell", "ring-olive/30", "ring-chartreuse/60"];
const MONO = ["bg-pink", "bg-cobalt", "bg-olive", "bg-coral"];

const STATUS: Record<string, string> = { generating: "Being made", story_review: "Story ready to read", ready: "Ready to read", failed: "Needs attention", draft: "Draft" };

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
    <div className="space-y-8">
      {deleted && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">That child and everything about them has been deleted.</p>
      )}
      <section className="full-bleed scallop-bottom relative -mt-8 overflow-x-clip bg-sky [--scallop:var(--color-sky)] sm:-mt-12">
        <div aria-hidden className="pointer-events-none absolute right-[8%] top-6 hidden text-4xl text-coral/70 sm:block">✦</div>
        <div className="relative mx-auto flex max-w-6xl flex-col gap-4 px-5 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-10">
          <div>
            <p className="eyebrow text-coral">My bookshelf</p>
            <h1 className="font-display text-3xl font-medium text-navy sm:text-4xl">Your little heroes</h1>
            <p className="mt-1 max-w-md text-navy/75">Make a picture book where your child is the star, then order a keepsake copy to hold.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/children/new" className="btn btn-primary">
              + Add a child
            </Link>
            <Link href="/examples" className="btn btn-secondary bg-white">
              See examples
            </Link>
          </div>
        </div>
      </section>

      {credits.enabled ? <CreditsCard c={credits} a={allowance} /> : <PlanCard a={allowance} />}

      {children.length === 0 ? (
        <div className="frame-candy-blue p-10 text-center">
          <p className="text-4xl" aria-hidden>
            📖
          </p>
          <p className="mt-2 font-display text-2xl">No children yet</p>
          <p className="mt-2 text-[color:var(--muted)]">Start by telling us about your child: their name, age and favorite things.</p>
          <Link href="/children/new" className="btn btn-primary mt-5">
            Add your first child
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {children.map((c, ci) => (
            <section key={c.id} className={`${PIPES[ci % PIPES.length]} rise-in bg-white p-5 pt-7 ring-1 ring-[color:var(--line)] sm:p-6 sm:pt-8`} data-testid="child-shelf">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <Link href={`/children/${c.id}`} className="group flex items-center gap-4">
                  <span className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full ring-4 ${RINGS[ci % RINGS.length]}`}>
                    {faces[c.id] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={faces[c.id]} alt="" className="h-full w-full scale-[1.6] object-cover object-[20%_35%]" />
                    ) : (
                      <span className={`flex h-full w-full items-center justify-center font-display text-2xl text-white ${MONO[ci % MONO.length]}`}>{(c.nickname || c.firstName).slice(0, 1)}</span>
                    )}
                  </span>
                  <span>
                    <span className="block font-display text-2xl font-medium group-hover:text-cobalt">{c.nickname || c.firstName}</span>
                    <span className="text-sm text-[color:var(--muted)]">
                      Age {c.age} · {c.books.length} {c.books.length === 1 ? "book" : "books"}
                    </span>
                  </span>
                </Link>
                <Link href={`/books/new?childId=${c.id}`} className="btn btn-primary btn-sm">
                  + New book
                </Link>
              </div>
              <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {c.books.map((b) => (
                  <li key={b.id}>
                    <Link href={`/books/${b.id}`} className="group block">
                      <span className="relative block aspect-square overflow-hidden bg-cream shadow-md ring-1 ring-black/5 transition group-hover:-translate-y-1 group-hover:rotate-[-1deg] group-hover:shadow-lg">
                        {thumbs[b.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbs[b.id]} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center p-3 text-center font-display text-sm text-navy/60">{b.status === "story_review" ? "Story ready to read" : "Painting..."}</span>
                        )}
                        <span aria-hidden className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-black/15 to-transparent" />
                      </span>
                      <span className="mt-2 block text-sm font-semibold leading-snug group-hover:text-cobalt">{b.title ?? "New story"}</span>
                      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[b.status] ?? "bg-sky text-navy"}`}>{STATUS[b.status] ?? b.status}</span>
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={`/books/new?childId=${c.id}`} className="flex aspect-square flex-col items-center justify-center gap-1 border-2 border-dashed border-bluebell text-center text-sm text-cobalt transition hover:bg-tint">
                    <span className="text-2xl" aria-hidden>
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

      <ScrollBand src="/examples/bands/pond.jpg" alt="Friends by a pink pond at sunset">
        <p className="font-display text-2xl italic sm:text-3xl">Every child deserves to be the hero of a story.</p>
      </ScrollBand>

      <section className="space-y-3" data-testid="grownups">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-display text-2xl font-medium">Family &amp; friends</h2>
            <p className="text-sm text-[color:var(--muted)]">Grown-ups who can star in your children&apos;s books: a secret-superhero mom, what Grandpa does at work...</p>
          </div>
          <Link href="/people/new" className="btn btn-secondary btn-sm">
            + Add a grown-up
          </Link>
        </div>
        {grownUps.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {grownUps.map((g) => (
              <Link key={g.id} href={`/children/${g.id}`} className="rounded-xl bg-white px-4 py-3 ring-1 ring-[color:var(--line)] hover:ring-cobalt">
                <span className="font-semibold">{g.nickname || g.firstName}</span> <span className="text-sm text-[color:var(--muted)]">{g.relationship}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-[color:var(--muted)]">
        Providers: story <b>{providers.story}</b>
        {providers.story !== "mock" && ` (${providers.storyModel})`}, images <b>{providers.image}</b>, print <b>{providers.print}</b>.
        {providers.story === "mock" && " Add ANTHROPIC_API_KEY to .env.local to write stories with Claude."}
      </p>
    </div>
  );
}
