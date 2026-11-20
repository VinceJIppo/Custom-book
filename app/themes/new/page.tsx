import Link from "next/link";
import { requireOnboardedUser } from "@/lib/session";
import { DraftThemeForm } from "@/components/ThemeForms";
import { activeProviderNames } from "@/lib/providers/registry";

export const dynamic = "force-dynamic";

export default async function NewTheme() {
  await requireOnboardedUser();
  const story = activeProviderNames().story;
  return (
    <div className="space-y-6">
      <Link href="/themes" className="text-sm font-semibold text-cobalt">
        ← Themes
      </Link>
      <h1 className="font-display text-3xl font-medium">Create a custom theme</h1>
      <p className="text-[color:var(--muted)]">
        Describe what your child loves. We&apos;ll draft a whole original world (setting, characters, story beats, colors), then you can change anything.
        {story === "mock" && " (Drafting uses a simple offline template until an Anthropic key is added.)"}
      </p>
      <DraftThemeForm />
    </div>
  );
}
