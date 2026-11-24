import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getChild, listPeople } from "@/lib/children/service";
import { listThemesForUser } from "@/lib/themes";
import { themeSamples } from "@/lib/themeSamples";
import { estimateFor } from "@/lib/books/service";
import { readingLevelForAge, STORY_LENGTHS } from "@/lib/schemas/book";
import { activeProviderNames } from "@/lib/providers/registry";
import { approvedStyles } from "@/lib/characters/service";
import { BookWizard } from "@/components/BookWizard";

export const dynamic = "force-dynamic";

export default async function NewBook({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const user = await requireOnboardedUser();
  const { childId } = await searchParams;
  if (!childId) {
    const kids = (await listPeople(user.id)).filter((p) => p.kind !== "grownup");
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-medium">Whose book is it?</h1>
        <p className="text-[color:var(--muted)]">Every book stars a child. Pick one, then add grown-ups to the story in the next step.</p>
        {kids.length === 0 ? (
          <p>
            Add a child first: <Link href="/children/new" className="text-cobalt underline">tell us about your child</Link>.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {kids.map((k) => (
              <li key={k.id}>
                <Link href={`/books/new?childId=${k.id}`} className="btn btn-secondary">
                  {k.nickname || k.firstName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  const child = await getChild(user.id, childId);
  if (!child) notFound();
  if (child.kind === "grownup") {
    return <p>Books are made for a child. Start a book from a child&apos;s page and add {child.nickname || child.firstName} to the story there.</p>;
  }
  const themes = (await listThemesForUser(user.id)).filter((t) => !t.config.hidden);
  const samples = await themeSamples(user.id, themes.map((t) => ({ id: t.id, slug: t.slug })));
  const estimates = Object.fromEntries(STORY_LENGTHS.map((n) => [n, estimateFor({ length: n })]));
  const friends = child.friends as string[];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-medium">A new book for {child.nickname || child.firstName}</h1>
      <BookWizard
        child={{ id: child.id, name: child.nickname || child.firstName, age: child.age, petName: child.petName, friend: friends[0] ?? null, lesson: child.lesson }}
        themes={themes.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.config.name,
          pitch: t.config.pitch,
          palette: t.config.artDirection.palette,
          defaultStyle: t.config.artDirection.defaultStyle,
          ageRange: t.config.ageRange,
          cast: t.config.supportingCast.map((c) => c.name),
          samples: samples[t.id],
          starters: t.config.starters,
        }))}
        defaultReadingLevel={readingLevelForAge(child.age)}
        estimates={estimates}
        storyProvider={activeProviderNames().story}
        approvedStyles={await approvedStyles(child.id)}
        needsCharacter={activeProviderNames().image !== "mock"}
        people={await Promise.all(
          (await listPeople(user.id))
            .filter((p) => p.id !== child.id)
            .map(async (p) => ({
              id: p.id,
              name: p.nickname || p.firstName,
              label: p.kind === "grownup" ? (p.relationship ?? "grown-up") : `child, ${p.age}`,
              kind: p.kind === "grownup" ? ("grownup" as const) : ("child" as const),
              approvedStyles: await approvedStyles(p.id),
              hasLook: !!p.look,
            })),
        )}
      />
    </div>
  );
}
