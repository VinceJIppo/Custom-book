"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createChild, deleteChildEverything, getChild, updateChild, type SaveResult } from "@/lib/children/service";
import { createAndStartBook, retryFailedJobs, type CreateBookResult } from "@/lib/books/service";

export async function confirmAdultAction(formData: FormData) {
  if (formData.get("adult") !== "on") redirect("/welcome?error=1");
  const user = await getCurrentUser();
  await db.user.update({ where: { id: user.id }, data: { ageConfirmedAt: new Date() } });
  redirect("/");
}

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const opt = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
};

function childFromForm(fd: FormData) {
  const lesson = fd.get("lesson") === "__other" ? opt(fd.get("lessonOther")) : opt(fd.get("lesson"));
  return {
    firstName: String(fd.get("firstName") ?? ""),
    nickname: opt(fd.get("nickname")),
    age: fd.get("age"),
    pronouns: fd.get("pronouns"),
    favorites: {
      colors: list(fd.get("colors")),
      animals: list(fd.get("animals")),
      foods: list(fd.get("foods")),
      activities: list(fd.get("activities")),
    },
    petName: opt(fd.get("petName")),
    petType: opt(fd.get("petType")),
    friends: list(fd.get("friends")),
    lesson,
  };
}

export async function saveChildAction(_prev: SaveResult | null, fd: FormData): Promise<SaveResult> {
  const user = await getCurrentUser();
  const id = opt(fd.get("id"));
  const raw = childFromForm(fd);
  const res = id ? await updateChild(user.id, id, raw) : await createChild(user.id, raw);
  if (!res.ok) return res;
  revalidatePath("/");
  redirect(`/children/${res.id}`);
}

export async function deleteChildAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = String(fd.get("id") ?? "");
  const child = await getChild(user.id, id);
  if (!child) redirect("/");
  if (String(fd.get("confirmName") ?? "").trim().toLowerCase() !== child.firstName.toLowerCase()) {
    redirect(`/children/${id}?deleteError=1`);
  }
  await deleteChildEverything(user.id, id);
  revalidatePath("/");
  redirect("/?deleted=1");
}

export async function createBookAction(_prev: CreateBookResult | null, fd: FormData): Promise<CreateBookResult> {
  const user = await getCurrentUser();
  const options = {
    length: fd.get("length"),
    readingLevel: fd.get("readingLevel"),
    style: fd.get("style"),
    trimSize: fd.get("trimSize"),
    includePet: fd.get("includePet") === "on",
    includeFriend: fd.get("includeFriend") === "on",
    lesson: opt(fd.get("lesson")),
    dedication: opt(fd.get("dedication")),
    instructions: opt(fd.get("instructions")),
  };
  const res = await createAndStartBook(user.id, { childId: String(fd.get("childId") ?? ""), themeId: String(fd.get("themeId") ?? ""), options });
  if (!res.ok) return res;
  redirect(`/books/${res.bookId}`);
}

export async function retryBookAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = String(fd.get("bookId") ?? "");
  await retryFailedJobs(user.id, id);
  redirect(`/books/${id}`);
}
