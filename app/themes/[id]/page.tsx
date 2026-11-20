import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getOwnTheme } from "@/lib/customThemes";
import { ThemeEditor } from "@/components/ThemeForms";
import { deleteThemeAction, duplicateThemeAction } from "@/app/actions";

export const dynamic = "force-dynamic";

export default async function EditTheme({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ drafted?: string; deleteError?: string }> }) {
  const user = await requireOnboardedUser();
  const theme = await getOwnTheme(user.id, (await params).id);
  if (!theme) notFound();
  const sp = await searchParams;
  return (
    <div className="space-y-6">
      <Link href="/themes" className="text-sm font-semibold text-berry">
        ← Themes
      </Link>
      <h1 className="font-display text-3xl font-semibold">{theme.config.name}</h1>
      {sp.drafted && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-200">Here&apos;s your draft. Change anything you like, then save.</p>}
      <ThemeEditor themeId={theme.id} config={theme.config} />
      <div className="flex flex-wrap gap-3 border-t border-[color:var(--line)] pt-6 text-sm font-semibold">
        <form action={duplicateThemeAction}>
          <input type="hidden" name="themeId" value={theme.id} />
          <button className="rounded-full bg-cream px-4 py-2 ring-1 ring-[color:var(--line)]">Duplicate</button>
        </form>
        <form action={deleteThemeAction}>
          <input type="hidden" name="themeId" value={theme.id} />
          <button className="rounded-full bg-red-50 px-4 py-2 text-red-800 ring-1 ring-red-200">Delete theme</button>
        </form>
        {sp.deleteError && <span className="self-center text-red-700">Books use this theme, so it can&apos;t be deleted.</span>}
      </div>
    </div>
  );
}
