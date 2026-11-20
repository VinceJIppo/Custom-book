import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { listThemesForUser } from "@/lib/themes";
import { duplicateThemeAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function Themes({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await requireOnboardedUser();
  const { deleted } = await searchParams;
  const themes = await listThemesForUser(user.id);
  const mine = themes.filter((t) => !t.isBuiltIn);
  const builtIn = themes.filter((t) => t.isBuiltIn);
  const Card = ({ t, own }: { t: (typeof themes)[number]; own: boolean }) => (
    <li className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-[color:var(--line)]">
      <div className="flex h-10">
        {t.config.artDirection.palette.map((c, i) => (
          <div key={i} className="flex-1" style={{ background: c }} />
        ))}
      </div>
      <div className="space-y-2 p-4">
        <p className="font-display text-lg font-semibold">{t.config.name}</p>
        <p className="text-sm text-[color:var(--muted)]">{t.config.pitch}</p>
        <div className="flex gap-2 pt-1 text-sm font-semibold">
          {own && (
            <Link href={`/themes/${t.id}`} className="rounded-full bg-berry px-3 py-1 text-white">
              Edit
            </Link>
          )}
          <form action={duplicateThemeAction}>
            <input type="hidden" name="themeId" value={t.id} />
            <button className="rounded-full bg-cream px-3 py-1 ring-1 ring-[color:var(--line)]">Duplicate</button>
          </form>
        </div>
      </div>
    </li>
  );
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold">Themes</h1>
          <p className="text-[color:var(--muted)]">Use any theme for any child and any book.</p>
        </div>
        <Link href="/themes/new" className="self-start rounded-full bg-berry px-5 py-2.5 font-semibold text-white">
          + Create a custom theme
        </Link>
      </div>
      {deleted && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Theme deleted.</p>}
      <section>
        <h2 className="font-display text-xl font-semibold">My themes</h2>
        {mine.length === 0 ? (
          <p className="mt-2 text-[color:var(--muted)]">None yet. Create one, or duplicate a built-in theme to make it your own.</p>
        ) : (
          <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((t) => (
              <Card key={t.id} t={t} own />
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="font-display text-xl font-semibold">Built-in themes</h2>
        <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {builtIn.map((t) => (
            <Card key={t.id} t={t} own={false} />
          ))}
        </ul>
      </section>
    </div>
  );
}
