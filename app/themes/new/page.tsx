import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { DraftThemeForm } from "@/components/ThemeForms";
import { activeProviderNames } from "@/lib/providers/registry";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewTheme() {
  const user = await requireOnboardedUser();
  const story = activeProviderNames().story;
  return (
    <div className="space-y-6">
      <div>
        <Link href="/themes" className="ss-link body-s inline-flex min-h-11 items-center">
          ← Themes
        </Link>
        <h1 className="heading mt-1">Create a custom theme</h1>
      </div>
      <p className="max-w-2xl text-ink-muted">
        Describe what your child loves. We&apos;ll draft a whole original world (setting, characters, story beats, colors), then you can change anything.
      </p>
      {story === "mock" && isAdminEmail(user.email) && <p className="body-s text-ink-muted">Admin only: drafting uses the offline template until an Anthropic key is set.</p>}
      <DraftThemeForm />
    </div>
  );
}
