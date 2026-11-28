import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getChild } from "@/lib/children/service";
import { GrownUpForm } from "@/components/GrownUpForm";

export const dynamic = "force-dynamic";

export default async function EditGrownUp({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const p = await getChild(user.id, (await params).id);
  if (!p || p.kind !== "grownup") notFound();
  return (
    <div className="space-y-6">
      <h1 className="heading">Edit {p.nickname || p.firstName}</h1>
      <GrownUpForm initial={{ id: p.id, firstName: p.firstName, nickname: p.nickname ?? "", relationship: p.relationship ?? "", pronouns: p.pronouns, about: p.about ?? "", look: p.look ?? "", hairLength: p.hairLength ?? "" }} />
    </div>
  );
}
