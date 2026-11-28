import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getChild, listPeople } from "@/lib/children/service";
import { listThemesForUser } from "@/lib/themes";
import { storyPictures, themeSamples } from "@/lib/themeSamples";
import { isAdminEmail } from "@/lib/admin";
import { HOUSE_STYLE, HOUSE_THEME_ID } from "@/lib/schemas/theme";
import { VOICES } from "@/lib/schemas/voices";
import { SimpleBookForm } from "@/components/SimpleBookForm";
import { estimateFor } from "@/lib/books/service";
import { readingLevelForAge, STORY_LENGTHS } from "@/lib/schemas/book";
import { activeProviderNames } from "@/lib/providers/registry";
import { approvedStyles } from "@/lib/characters/service";
import { BookWizard } from "@/components/BookWizard";

export const dynamic = "force-dynamic";

export default async function NewBook({ searchParams }: { searchParams: Promise<{ childId?: string; advanced?: string }> }) {
  const user = await requireOnboardedUser();
  const { childId, advanced } = await searchParams;
  if (!childId) {
    const kids = (await listPeople(user.id)).filter((p) => p.kind !== "grownup");
    return (
      <div className="space-y-4">
        <h1 className="heading">Whose book is it?</h1>
        <p className="text-ink-muted">Every book stars a child. Pick one, then add grown-ups to the story in the next step.</p>
        {kids.length === 0 ? (
          <p>
            Add a child first: <Link href="/children/new" className="ss-link">tell us about your child</Link>.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {kids.map((k) => (
              <li key={k.id}>
                <Link href={`/books/new?childId=${k.id}`} className="ss-btn ss-btn--secondary">
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
    return <p className="ss-note">Books are made for a child. Start a book from a child&apos;s page and add {child.nickname || child.firstName} to the story there.</p>;
  }
  const people = await Promise.all(
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
  );
  const friendList = child.friends as string[];

  // Parents pick one of the house theme's ready-made stories; admins can open the full options.
  if (!(advanced && isAdminEmail(user.email))) {
    const house = (await listThemesForUser(user.id)).find((t) => t.slug === HOUSE_THEME_ID);
    if (!house) notFound();
    const starters = house.config.starters ?? [];
    const fallback = (await themeSamples(user.id, [{ id: house.id, slug: house.slug }]))[house.id] ?? [];
    const pictures = storyPictures(house.slug, starters.map((s) => s.id), fallback);
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="heading">A new book for {child.nickname || child.firstName}</h1>
          {isAdminEmail(user.email) && (
            <Link href={`/books/new?childId=${child.id}&advanced=1`} className="ss-link text-sm">
              All options (admin)
            </Link>
          )}
        </div>
        <SimpleBookForm
          child={{ id: child.id, name: child.nickname || child.firstName, petName: child.petName, friend: friendList[0] ?? null }}
          themeId={house.id}
          style={HOUSE_STYLE}
          readingLevel={readingLevelForAge(child.age)}
          stories={starters.map((s) => ({ id: s.id, title: s.title, summary: s.summary ?? s.idea.slice(0, 140), voice: s.voice ?? "classic", voiceLabel: VOICES[s.voice ?? "classic"].label, picture: pictures[s.id] }))}
          people={people}
          needsCharacter={activeProviderNames().image !== "mock"}
          heroReady={(await approvedStyles(child.id)).includes(HOUSE_STYLE)}
        />
      </div>
    );
  }

  const themes = await listThemesForUser(user.id);
  const samples = await themeSamples(user.id, themes.map((t) => ({ id: t.id, slug: t.slug })));
  const estimates = Object.fromEntries(STORY_LENGTHS.map((n) => [n, estimateFor({ length: n })]));
  const friends = child.friends as string[];

  return (
    <div className="space-y-6">
      <h1 className="heading">A new book for {child.nickname || child.firstName}</h1>
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
        people={people}
      />
    </div>
  );
}
