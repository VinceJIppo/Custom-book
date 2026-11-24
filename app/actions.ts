"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { log } from "@/lib/log";
import { createChild, deleteChildEverything, getChild, updateChild, type SaveResult } from "@/lib/children/service";
import { createAndStartBook, retryFailedJobs, type CreateBookResult } from "@/lib/books/service";
import { approveStory } from "@/lib/books/pictures";
import { startCreditPurchase } from "@/lib/credits/purchase";
import { rewritePageRange, rewriteWholeStory, undoRewrite } from "@/lib/books/review";
import { acceptFlagged, changeLayout, movePage, requestNewArt, requestNewCover, restoreVersion, reviseTextWithAI, updatePageText } from "@/lib/books/pages";
import { deleteCustomTheme, draftCustomTheme, duplicateTheme, saveCustomTheme } from "@/lib/customThemes";
import { startExport, startValidation } from "@/lib/books/export";
import { addPhoto, approveSheetOption, deleteCharacterSheet, deletePhoto, saveBible, setDeleteOriginals, startCharacterSheet } from "@/lib/characters/service";

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
    voice: opt(fd.get("voice")),
    trimSize: fd.get("trimSize"),
    includePet: fd.get("includePet") === "on",
    includeFriend: fd.get("includeFriend") === "on",
    lesson: opt(fd.get("lesson")),
    dedication: opt(fd.get("dedication")),
    instructions: opt(fd.get("instructions")),
    cast: fd.getAll("cast").map((v) => String(v)).filter(Boolean).map((id) => ({ profileId: id, part: opt(fd.get(`part_${id}`)) })),
    spotlightId: opt(fd.get("spotlightId")),
    storyAbout: opt(fd.get("storyAbout")),
    pictureSpeed: opt(fd.get("pictureSpeed")),
    starterId: opt(fd.get("starterId")),
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

/** Buy a credit pack: off to the payment page. */
export async function buyCreditsAction(fd: FormData) {
  const user = await getCurrentUser();
  const res = await startCreditPurchase(user.id, Number(fd.get("amount")));
  redirect(res.ok ? res.url : `/credits?error=${encodeURIComponent(res.message)}`);
}

/** The parent approved the story: start the pictures. */
export async function approveStoryAction(fd: FormData) {
  const user = await getCurrentUser();
  const id = String(fd.get("bookId") ?? "");
  const res = await approveStory(user.id, id, String(fd.get("pictureSpeed") ?? ""));
  redirect(res.ok ? `/books/${id}` : `/books/${id}?error=${encodeURIComponent(res.message)}`);
}

/** Save one page's words while reviewing the story (stays on the review screen). */
export async function reviewTextAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const res = await updatePageText(user.id, String(fd.get("pageId") ?? ""), String(fd.get("text") ?? ""));
  if (!res.ok) return { message: res.message };
  revalidatePath(`/books/${String(fd.get("bookId") ?? "")}`);
  return { ok: true, message: "Saved." };
}

/** Redraw the book's cover, with an optional note. */
export async function redrawCoverAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const bookId = String(fd.get("bookId") ?? "");
  const res = await requestNewCover(user.id, bookId, String(fd.get("note") ?? ""));
  if (!res.ok) return { message: res.message };
  redirect(`/books/${bookId}`);
}

export interface StoryChangeState {
  ok?: boolean;
  message?: string;
  undoTag?: string;
}

/** Rewrite the whole story, or a range of pages, from the parent's notes. */
export async function changeStoryAction(_prev: StoryChangeState | null, fd: FormData): Promise<StoryChangeState> {
  const user = await getCurrentUser();
  const bookId = String(fd.get("bookId") ?? "");
  const note = String(fd.get("instruction") ?? "");
  if (fd.get("scope") === "all") {
    const res = await rewriteWholeStory(user.id, bookId, note);
    if (!res.ok) return { message: res.message };
    redirect(`/books/${bookId}`);
  }
  const res = await rewritePageRange(user.id, bookId, Number(fd.get("from")), Number(fd.get("to")), note);
  revalidatePath(`/books/${bookId}`);
  return res.ok ? { ok: true, message: res.message, undoTag: res.undoTag } : { message: res.message };
}

export async function undoStoryChangeAction(_prev: StoryChangeState | null, fd: FormData): Promise<StoryChangeState> {
  const user = await getCurrentUser();
  const bookId = String(fd.get("bookId") ?? "");
  const res = await undoRewrite(user.id, bookId, String(fd.get("undoTag") ?? ""));
  revalidatePath(`/books/${bookId}`);
  return { ok: res.ok, message: res.message };
}

/** Ask for a rewrite of one page while reviewing the story. */
export async function reviewReviseAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const res = await reviseTextWithAI(user.id, String(fd.get("pageId") ?? ""), String(fd.get("instruction") ?? ""));
  if (!res.ok) return { message: res.message };
  revalidatePath(`/books/${String(fd.get("bookId") ?? "")}`);
  return { ok: true, message: "Rewritten." };
}

// ---------------------------------------------------------------- Photos and characters


export interface PhotoUploadState {
  results: Array<{ name: string; ok: boolean; message?: string; problems?: string[] }>;
}

export async function uploadPhotosAction(_prev: PhotoUploadState | null, fd: FormData): Promise<PhotoUploadState> {
  const user = await getCurrentUser();
  const childId = String(fd.get("childId") ?? "");
  const consent = fd.get("consent") === "on";
  const files = fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { results: [{ name: "", ok: false, message: "Choose at least one photo." }] };
  const results: PhotoUploadState["results"] = [];
  const admin = isAdminEmail(user.email);
  for (const f of files.slice(0, 3)) {
    try {
      const r = await addPhoto(user.id, childId, Buffer.from(await f.arrayBuffer()), consent);
      const problems = [...(r.ok ? [] : r.problems), ...(!r.ok && admin && r.detail ? [`(Admin only) ${r.detail}`] : [])];
      results.push(r.ok ? { name: f.name, ok: true } : { name: f.name, ok: false, message: r.message, problems });
    } catch (err) {
      // Never send the parent to the error page over one photo: say what happened and keep the form.
      log.error("Photo upload failed", { childId, err: String(err) });
      results.push({ name: f.name, ok: false, message: "Something went wrong saving this photo. Please try again in a few minutes.", problems: admin ? [`(Admin only) ${String(err).slice(0, 300)}`] : [] });
    }
  }
  revalidatePath(`/children/${childId}/character`);
  return { results };
}

export async function deletePhotoAction(fd: FormData) {
  const user = await getCurrentUser();
  await deletePhoto(user.id, String(fd.get("photoId") ?? ""));
  revalidatePath(`/children/${String(fd.get("childId") ?? "")}/character`);
}

export async function setDeleteOriginalsAction(fd: FormData) {
  const user = await getCurrentUser();
  const childId = String(fd.get("childId") ?? "");
  await setDeleteOriginals(user.id, childId, fd.get("value") === "on");
  revalidatePath(`/children/${childId}/character`);
}

export async function startSheetAction(_prev: { message?: string } | null, fd: FormData): Promise<{ message?: string }> {
  const user = await getCurrentUser();
  const childId = String(fd.get("childId") ?? "");
  const res = await startCharacterSheet(user.id, childId, { style: String(fd.get("style") ?? ""), outfit: opt(fd.get("outfit")) });
  if (!res.ok) return { message: res.message };
  revalidatePath(`/children/${childId}/character`);
  return {};
}

export async function approveSheetAction(fd: FormData) {
  const user = await getCurrentUser();
  const childId = String(fd.get("childId") ?? "");
  const res = await approveSheetOption(user.id, String(fd.get("sheetId") ?? ""), Number(fd.get("index")));
  redirect(`/children/${childId}/character${res.ok ? `?approved=1&deleted=${res.deletedPhotos}` : "?approveError=1"}`);
}

export async function saveBibleAction(_prev: { ok?: boolean; message?: string } | null, fd: FormData): Promise<{ ok?: boolean; message?: string }> {
  const user = await getCurrentUser();
  const field = (k: string) => String(fd.get(k) ?? "").trim();
  const res = await saveBible(user.id, String(fd.get("sheetId") ?? ""), {
    hair: field("hair"),
    eyes: field("eyes"),
    skinTone: field("skinTone"),
    faceShape: field("faceShape"),
    glasses: field("glasses"),
    freckles: field("freckles"),
    signatureOutfit: field("signatureOutfit"),
    otherDetails: field("otherDetails"),
  });
  if (!res.ok) return { message: res.message };
  revalidatePath(`/children/${String(fd.get("childId") ?? "")}/character`);
  return { ok: true, message: "Saved. New pages will use these details." };
}

// ---------------------------------------------------------------- Page editing


export interface EditState {
  ok?: boolean;
  message?: string;
}

function editPath(fd: FormData) {
  return `/books/${String(fd.get("bookId") ?? "")}/pages/${String(fd.get("pageId") ?? "")}`;
}

export async function updateTextAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const res = await updatePageText(user.id, String(fd.get("pageId") ?? ""), String(fd.get("text") ?? ""));
  if (!res.ok) return { message: res.message };
  revalidatePath(editPath(fd));
  return { ok: true, message: "Text saved." };
}

export async function reviseTextAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const res = await reviseTextWithAI(user.id, String(fd.get("pageId") ?? ""), String(fd.get("instruction") ?? ""));
  if (!res.ok) return { message: res.message };
  revalidatePath(editPath(fd));
  return { ok: true, message: "Rewritten. Not quite right? Restore the previous version below." };
}

export async function artAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const mode = fd.get("mode") === "edit" ? "edit" : "redraw";
  const res = await requestNewArt(user.id, String(fd.get("pageId") ?? ""), mode, opt(fd.get("note")));
  if (!res.ok) return { message: res.message };
  revalidatePath(editPath(fd));
  return { ok: true, message: mode === "edit" ? "Changing the picture..." : "Redrawing the picture..." };
}

export async function layoutAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const res = await changeLayout(user.id, String(fd.get("pageId") ?? ""), String(fd.get("layout") ?? ""), String(fd.get("textZone") ?? "bottom"));
  if (!res.ok) return { message: res.message };
  revalidatePath(editPath(fd));
  return { ok: true, message: "Layout changed. If the picture is cropped awkwardly, redraw it for this layout." };
}

export async function movePageAction(fd: FormData) {
  const user = await getCurrentUser();
  await movePage(user.id, String(fd.get("pageId") ?? ""), fd.get("direction") === "up" ? "up" : "down");
  revalidatePath(`/books/${String(fd.get("bookId") ?? "")}/edit`);
}

export async function restoreVersionAction(fd: FormData) {
  const user = await getCurrentUser();
  await restoreVersion(user.id, String(fd.get("pageId") ?? ""), String(fd.get("versionId") ?? ""));
  revalidatePath(editPath(fd));
}

export async function acceptFlaggedAction(fd: FormData) {
  const user = await getCurrentUser();
  await acceptFlagged(user.id, String(fd.get("pageId") ?? ""));
  revalidatePath(editPath(fd));
}

// ---------------------------------------------------------------- Custom themes

export interface ThemeFormState {
  message?: string;
  errors?: Record<string, string>;
  ok?: boolean;
}

export async function draftThemeAction(_prev: ThemeFormState | null, fd: FormData): Promise<ThemeFormState> {
  const user = await getCurrentUser();
  const age = Number(fd.get("age"));
  const res = await draftCustomTheme(user.id, { description: String(fd.get("description") ?? ""), childAge: Number.isFinite(age) && age > 0 ? age : undefined });
  if (!res.ok) return { message: res.message };
  redirect(`/themes/${res.themeId}?drafted=1`);
}

const lines = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export async function saveThemeAction(_prev: ThemeFormState | null, fd: FormData): Promise<ThemeFormState> {
  const user = await getCurrentUser();
  const themeId = String(fd.get("themeId") ?? "");
  const cast = [0, 1, 2, 3]
    .map((i) => ({ name: String(fd.get(`cast${i}name`) ?? "").trim(), role: String(fd.get(`cast${i}role`) ?? "").trim(), look: String(fd.get(`cast${i}look`) ?? "").trim() }))
    .filter((c) => c.name || c.role || c.look);
  const res = await saveCustomTheme(user.id, themeId, {
    name: String(fd.get("name") ?? "").trim(),
    genre: opt(fd.get("genre")),
    ageRange: [Number(fd.get("ageMin")), Number(fd.get("ageMax"))],
    pitch: String(fd.get("pitch") ?? "").trim(),
    setting: String(fd.get("setting") ?? "").trim(),
    supportingCast: cast,
    storyBeats: lines(fd.get("storyBeats")),
    powerIdeas: opt(fd.get("powerIdeas")),
    artDirection: {
      defaultStyle: String(fd.get("defaultStyle") ?? ""),
      palette: [0, 1, 2, 3].map((i) => String(fd.get(`palette${i}`) ?? "").toUpperCase()).filter(Boolean),
      mood: String(fd.get("mood") ?? "").trim(),
    },
    contentRules: lines(fd.get("contentRules")),
  });
  if (!res.ok) return { message: res.message, errors: res.errors };
  revalidatePath("/themes");
  return { ok: true, message: "Theme saved. It's ready to use in any book." };
}

export async function duplicateThemeAction(fd: FormData) {
  const user = await getCurrentUser();
  const res = await duplicateTheme(user.id, String(fd.get("themeId") ?? ""));
  redirect(res.ok ? `/themes/${res.themeId}` : "/themes?error=duplicate");
}

export async function deleteThemeAction(fd: FormData) {
  const user = await getCurrentUser();
  const res = await deleteCustomTheme(user.id, String(fd.get("themeId") ?? ""));
  redirect(res.ok ? "/themes?deleted=1" : `/themes/${String(fd.get("themeId") ?? "")}?deleteError=1`);
}

// ---------------------------------------------------------------- Print files

export async function startExportAction(_prev: EditState | null, fd: FormData): Promise<EditState> {
  const user = await getCurrentUser();
  const bookId = String(fd.get("bookId") ?? "");
  const res = await startExport(user.id, bookId, String(fd.get("productId") ?? ""));
  if (!res.ok) return { message: res.message };
  revalidatePath(`/books/${bookId}/print`);
  return { ok: true, message: "Making print files..." };
}

export async function validateExportAction(fd: FormData) {
  const user = await getCurrentUser();
  const bookId = String(fd.get("bookId") ?? "");
  const res = await startValidation(user.id, String(fd.get("exportId") ?? ""));
  redirect(`/books/${bookId}/print${res.ok ? "" : `?error=${encodeURIComponent(res.message)}`}`);
}

export async function deleteCharacterAction(fd: FormData) {
  const user = await getCurrentUser();
  const childId = String(fd.get("childId") ?? "");
  const res = await deleteCharacterSheet(user.id, String(fd.get("sheetId") ?? ""));
  revalidatePath(`/children/${childId}/character`);
  redirect(`/children/${childId}/character?${res.ok ? "characterDeleted=1" : `deleteError=${encodeURIComponent(res.message)}`}`);
}
