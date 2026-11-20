import Link from "next/link";
import { db } from "@/lib/db";
import { requireOnboardedUser } from "@/lib/session";
import { activeProviderNames } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { generating: "Being made", ready: "Ready to read", failed: "Needs attention", draft: "Draft" };

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireOnboardedUser();
  const { deleted } = await searchParams;
  const children = await db.childProfile.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { books: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, createdAt: true } } },
  });
  const providers = activeProviderNames();

  return (
    <div className="space-y-8">
      {deleted && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">That child and everything about them has been deleted.</p>
      )}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">Your little heroes</h1>
          <p className="mt-1 text-[color:var(--muted)]">Make a picture book where your child is the star.</p>
        </div>
        <Link href="/children/new" className="self-start rounded-full bg-berry px-5 py-2.5 font-semibold text-white shadow hover:bg-berry-dark sm:self-auto">
          + Add a child
        </Link>
      </section>

      {children.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[color:var(--line)] bg-white p-10 text-center">
          <p className="font-display text-2xl">No children yet</p>
          <p className="mt-2 text-[color:var(--muted)]">Start by telling us about your child: their name, age and favorite things.</p>
          <Link href="/children/new" className="mt-5 inline-block rounded-full bg-berry px-5 py-2.5 font-semibold text-white">
            Add your first child
          </Link>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {children.map((c) => (
            <div key={c.id} className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-[color:var(--line)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/children/${c.id}`} className="font-display text-2xl font-semibold hover:text-berry">
                    {c.nickname || c.firstName}
                  </Link>
                  <p className="text-sm text-[color:var(--muted)]">Age {c.age}</p>
                </div>
                <Link href={`/books/new?childId=${c.id}`} className="rounded-full bg-star px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:brightness-95">
                  New book
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {c.books.length === 0 && <li className="text-sm text-[color:var(--muted)]">No books yet.</li>}
                {c.books.map((b) => (
                  <li key={b.id}>
                    <Link href={`/books/${b.id}`} className="flex items-center justify-between rounded-xl bg-cream px-3 py-2 hover:bg-violet-50">
                      <span className="font-semibold">{b.title ?? "New story"}</span>
                      <span className="text-xs text-[color:var(--muted)]">{STATUS[b.status] ?? b.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-[color:var(--muted)]">
        Providers: story <b>{providers.story}</b>
        {providers.story !== "mock" && ` (${providers.storyModel})`}, images <b>{providers.image}</b>, print <b>{providers.print}</b>.
        {providers.story === "mock" && " Add ANTHROPIC_API_KEY to .env.local to write stories with Claude."}
      </p>
    </div>
  );
}
