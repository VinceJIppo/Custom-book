"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createGrownUp, updateGrownUp, type SaveResult } from "@/lib/children/service";

export async function saveGrownUpAction(_prev: SaveResult | null, fd: FormData): Promise<SaveResult> {
  const user = await getCurrentUser();
  const v = (k: string) => {
    const s = String(fd.get(k) ?? "").trim();
    return s || undefined;
  };
  const raw = { firstName: v("firstName"), nickname: v("nickname"), relationship: v("relationship"), pronouns: v("pronouns"), about: v("about"), look: v("look"), hairLength: v("hairLength") };
  const id = v("id");
  const res = id ? await updateGrownUp(user.id, id, raw) : await createGrownUp(user.id, raw);
  if (!res.ok) return res;
  revalidatePath("/");
  redirect(`/children/${res.id}`);
}
