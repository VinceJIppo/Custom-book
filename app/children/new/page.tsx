import { ChildForm } from "@/components/ChildForm";
import { requireOnboardedUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewChild() {
  await requireOnboardedUser();
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Tell us about your child</h1>
      <ChildForm
        initial={{ firstName: "", nickname: "", age: "", pronouns: "", colors: "", animals: "", foods: "", activities: "", petName: "", petType: "", friends: "", lesson: "" }}
      />
    </div>
  );
}
