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
      <Link href="/themes" className="ss-link body-s inline-flex min-h-11 items-center">
        ← Themes
      </Link>
      <h1 className="heading break-words">{theme.config.name}</h1>
      {sp.drafted && (
        <p className="ss-note ss-note--success" role="status">
          Here&apos;s your draft. Change anything you like, then save.
        </p>
      )}
      <ThemeEditor themeId={theme.id} config={theme.config} />
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <form action={duplicateThemeAction}>
          <input type="hidden" name="themeId" value={theme.id} />
          <button className="ss-btn ss-btn--secondary">Duplicate</button>
        </form>
        <form action={deleteThemeAction}>
          <input type="hidden" name="themeId" value={theme.id} />
          <button className="ss-btn ss-btn--danger">Delete theme</button>
        </form>
        {sp.deleteError && (
          <p className="ss-note ss-note--error" role="alert">
            Books use this theme, so it can&apos;t be deleted.
          </p>
        )}
      </div>
    </div>
  );
}
