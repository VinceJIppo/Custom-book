import { notFound } from "next/navigation";
import { ChildForm } from "@/components/ChildForm";
import { requireOnboardedUser } from "@/lib/session";
import { getChild } from "@/lib/children/service";
import { FavoritesSchema } from "@/lib/schemas/child";

export const dynamic = "force-dynamic";

export default async function EditChild({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOnboardedUser();
  const child = await getChild(user.id, (await params).id);
  if (!child) notFound();
  const fav = FavoritesSchema.parse(child.favorites);
  return (
    <div className="space-y-6">
      <h1 className="heading">Edit {child.firstName}</h1>
      <ChildForm
        initial={{
          id: child.id,
          firstName: child.firstName,
          nickname: child.nickname ?? "",
          age: child.age,
          pronouns: child.pronouns,
          colors: fav.colors.join(", "),
          animals: fav.animals.join(", "),
          foods: fav.foods.join(", "),
          activities: fav.activities.join(", "),
          petName: child.petName ?? "",
          petType: child.petType ?? "",
          friends: (child.friends as string[]).join(", "),
          lesson: child.lesson ?? "",
        }}
      />
    </div>
  );
}
