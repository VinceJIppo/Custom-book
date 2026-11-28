import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { listThemesForUser } from "@/lib/themes";
import { themeSamples } from "@/lib/themeSamples";
import { ThemeSamples } from "@/components/ThemeSamples";
import { duplicateThemeAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Themes({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireOnboardedUser();
  const { deleted } = await searchParams;
  const themes = (await listThemesForUser(user.id)).filter((t) => !t.config.hidden);
  const mine = themes.filter((t) => !t.isBuiltIn);
  const builtIn = themes.filter((t) => t.isBuiltIn);
  const samples = await themeSamples(user.id, themes.map((t) => ({ id: t.id, slug: t.slug })));
  const Card = ({ t, own }: { t: (typeof themes)[number]; own: boolean }) => (
    <li className="ss-card min-w-0 overflow-hidden p-0">
      <ThemeSamples samples={samples[t.id]} palette={t.config.artDirection.palette} name={t.config.name} tall />
      <div className="space-y-2 p-4">
        <p className="title">{t.config.name}</p>
        <p className="text-sm text-ink-muted">{t.config.pitch}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {own && (
            <Link href={`/themes/${t.id}`} className="ss-btn ss-btn--secondary ss-btn--sm">
              Edit
            </Link>
          )}
          <form action={duplicateThemeAction}>
            <input type="hidden" name="themeId" value={t.id} />
            <button className="ss-btn ss-btn--secondary ss-btn--sm">Duplicate</button>
          </form>
        </div>
      </div>
    </li>
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading">Themes</h1>
          <p className="mt-1 text-ink-muted">Use any theme for any child and any book.</p>
        </div>
        <Link href="/themes/new" className="ss-btn ss-btn--primary self-start">
          Create a theme
        </Link>
      </div>
      {deleted && (
        <p className="ss-note ss-note--success" role="status">
          Theme deleted.
        </p>
      )}
      <section>
        <h2 className="title">My themes</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-ink-muted">None yet. Create one, or duplicate a built-in theme to make it your own.</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((t) => (
              <Card key={t.id} t={t} own />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="title">Built-in themes</h2>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtIn.map((t) => (
            <Card key={t.id} t={t} own={false} />
          ))}
        </ul>
      </section>
    </div>
  );
}
