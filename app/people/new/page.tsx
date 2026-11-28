import { requireOnboardedUser } from "@/lib/session";
import { GrownUpForm } from "@/components/GrownUpForm";

export const dynamic = "force-dynamic";

export default async function NewGrownUp() {
  await requireOnboardedUser();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="heading">Add a grown-up</h1>
        <p className="mt-2 text-ink-muted">A parent, grandparent or anyone special who can star in your children&apos;s books, like Mom being secretly a superhero.</p>
      </div>
      <GrownUpForm initial={{ firstName: "", nickname: "", relationship: "", pronouns: "", about: "", look: "", hairLength: "" }} />
    </div>
  );
}
