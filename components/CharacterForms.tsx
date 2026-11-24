"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { saveBibleAction, startSheetAction, uploadPhotosAction } from "@/app/actions";
import { ART_STYLES, ART_STYLE_LABELS } from "@/lib/schemas/theme";
import type { CharacterBible } from "@/lib/schemas/story";
import { cropToJpeg, headAndShoulders, openPhoto, PhotoCropper, type Box } from "./PhotoCropper";

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

function submitKeeping(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

/** A chosen photo, waiting to upload. box: the crop applied (null = whole photo). */
type Picked = { id: number; file: File; bitmap: ImageBitmap | null; box: Box | null; thumb: string | null };

function thumbOf(bitmap: ImageBitmap, box: Box | null) {
  const b = box ?? { left: 0, top: 0, width: 1, height: 1 };
  const sw = b.width * bitmap.width;
  const sh = b.height * bitmap.height;
  const scale = 160 / Math.max(sw, sh);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale));
  c.height = Math.max(1, Math.round(sh * scale));
  c.getContext("2d")!.drawImage(bitmap, b.left * bitmap.width, b.top * bitmap.height, sw, sh, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.8);
}

/** A face box found in a cropped upload, moved back into the original photo's coordinates. */
function toOriginal(face: Box, applied: Box | null): Box {
  const a = applied ?? { left: 0, top: 0, width: 1, height: 1 };
  return { left: a.left + face.left * a.width, top: a.top + face.top * a.height, width: face.width * a.width, height: face.height * a.height };
}

/**
 * Choose photos, optionally crop each one, then upload. Photos are shrunk to
 * MAX_SIDE in the browser first. When the check finds several faces (or a tiny
 * one), the cropper opens around the main face so one click fixes it.
 */
export function PhotoUpload({ childId, consentGiven, remaining, grownUp = false }: { childId: string; consentGiven: boolean; remaining: number; grownUp?: boolean }) {
  const [state, action, pending] = useActionState(uploadPhotosAction, null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [cropping, setCropping] = useState<{ id: number; initial: Box | null; reason?: string } | null>(null);
  const [consent, setConsent] = useState(consentGiven);
  const [note, setNote] = useState<string | null>(null);
  // Uploaded photos by the name the server saw, so a "crop this" suggestion can reopen the original.
  const [sent, setSent] = useState<Record<string, Picked>>({});
  const nextId = useRef(1);
  const who = grownUp ? "this person" : "your child";

  const choose = async (files: FileList | null) => {
    setNote(null);
    const list = Array.from(files ?? []).slice(0, Math.max(0, remaining - picked.length));
    const out: Picked[] = [];
    for (const file of list) {
      const bitmap = await openPhoto(file);
      out.push({ id: nextId.current++, file, bitmap, box: null, thumb: bitmap ? thumbOf(bitmap, null) : null });
    }
    setPicked((p) => [...p, ...out]);
  };

  const upload = async (items: Picked[]) => {
    if (!items.length) return;
    if (!consentGiven && !consent) {
      setNote("Please tick the permission box first.");
      return;
    }
    const fd = new FormData();
    fd.set("childId", childId);
    if (consent) fd.set("consent", "on");
    let bytes = 0;
    const added: Record<string, Picked> = {};
    for (const it of items) {
      // Shrink (and crop) in the browser when we can; HEIC on some browsers goes as is.
      const f = it.bitmap ? await cropToJpeg(it.bitmap, it.box ?? { left: 0, top: 0, width: 1, height: 1 }, `${it.id}-${it.file.name}`) : it.file;
      bytes += f.size;
      added[f.name] = it;
      fd.append("photos", f, f.name);
    }
    // The server takes up to 25 MB per upload; bigger uploads fail before we can explain why.
    if (bytes > 24 * 1024 * 1024) {
      setNote(`These photos add up to ${Math.round(bytes / 1024 / 1024)} MB, more than we can take at once (24 MB). Upload them one at a time.`);
      return;
    }
    setNote(null);
    setSent((m) => ({ ...m, ...added }));
    setPicked((p) => p.filter((x) => !items.includes(x)));
    startTransition(() => action(fd));
  };

  if (remaining <= 0) return <p className="text-sm text-[color:var(--muted)]">You have 3 photos, the most we use. Remove one to add another.</p>;

  const current = cropping ? (picked.find((p) => p.id === cropping.id) ?? Object.values(sent).find((p) => p.id === cropping.id)) : null;
  if (current?.bitmap && cropping) {
    return (
      <PhotoCropper
        bitmap={current.bitmap}
        initial={cropping.initial}
        title={cropping.reason ?? `Crop to just ${who}`}
        hint={`Drag the box over ${who}\u2019s face and shoulders, or drag a corner to resize it. Leave other people out.`}
        onCancel={() => setCropping(null)}
        onDone={(box) => {
          const updated = { ...current, box, thumb: thumbOf(current.bitmap!, box) };
          setCropping(null);
          // A suggested crop of an uploaded photo goes straight back up.
          if (!picked.some((p) => p.id === current.id)) void upload([updated]);
          else setPicked((p) => p.map((x) => (x.id === current.id ? updated : x)));
        }}
      />
    );
  }

  return (
    <div className="space-y-3" data-testid="photo-upload">
      <input
        type="file"
        name="photos"
        multiple
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        onChange={(e) => {
          void choose(e.currentTarget.files);
          e.currentTarget.value = "";
        }}
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-navy"
      />
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {picked.map((p) => (
            <li key={p.id} className="w-32 space-y-1 text-center text-xs">
              {p.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.thumb} alt="" className="mx-auto h-28 w-28 rounded-lg object-cover ring-1 ring-black/10" />
              ) : (
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-lg bg-cream p-2 ring-1 ring-black/10">{p.file.name}</div>
              )}
              <div className="flex justify-center gap-2">
                {p.bitmap ? (
                  <button type="button" className="font-semibold text-cobalt" onClick={() => setCropping({ id: p.id, initial: p.box })} data-testid="crop-photo">
                    {p.box ? "Re-crop" : "Crop"}
                  </button>
                ) : (
                  <span className="text-[color:var(--muted)]" title="This browser can't show this photo type, so it can't be cropped here.">
                    No preview
                  </span>
                )}
                <button type="button" className="text-[color:var(--muted)]" onClick={() => setPicked((x) => x.filter((y) => y.id !== p.id))}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!consentGiven && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.currentTarget.checked)} className="mt-0.5 size-5 accent-[color:var(--color-cobalt)]" />
          <span>
            {grownUp
              ? "These are photos of me, or this person has given me permission to upload them."
              : "I am this child\u2019s parent or legal guardian, or I have their permission to upload these photos."}
          </span>
        </label>
      )}
      <button type="button" disabled={pending || picked.length === 0} className="btn btn-primary" onClick={() => void upload(picked)}>
        {pending ? "Checking photos..." : picked.length ? `Upload ${picked.length} photo${picked.length > 1 ? "s" : ""}` : `Choose up to ${remaining} photo${remaining > 1 ? "s" : ""}`}
      </button>
      {note && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {note}
        </p>
      )}
      {state?.results.map((r, i) => {
        const original = sent[r.name];
        const canCrop = !r.ok && r.crop && original?.bitmap;
        return (
          <div key={i} role="status" className={`rounded-xl px-3 py-2 text-sm ring-1 ${r.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
            <b>{original?.file.name ?? (r.name || "Photo")}:</b> {r.ok ? "added." : r.message}
            {r.problems && r.problems.length > 0 && (
              <ul className="mt-1 list-disc pl-5">
                {r.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {canCrop && (
              <button
                type="button"
                className="btn btn-primary btn-sm mt-2"
                data-testid="crop-suggested"
                onClick={() => {
                  const bmp = original.bitmap!;
                  const face = toOriginal(r.crop!, original.box);
                  setCropping({ id: original.id, initial: headAndShoulders(face, bmp.width / bmp.height), reason: `We framed the main face. Adjust the box if it isn\u2019t ${who}, then upload.` });
                }}
              >
                Crop to the main face
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function StartSheetForm({ childId, defaultStyle, cost, rounds, maxRounds, disabled }: { childId: string; defaultStyle: string; cost: number; rounds: Record<string, number>; maxRounds: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(startSheetAction, null);
  return (
    <form onSubmit={submitKeeping(action)} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="childId" value={childId} />
      <label className="block">
        <span className="font-semibold">Art style</span>
        <select name="style" defaultValue={defaultStyle} className={input}>
          {ART_STYLES.map((s) => (
            <option key={s} value={s}>
              {ART_STYLE_LABELS[s]} ({rounds[s] ?? 0} of {maxRounds} sets used)
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Outfit</span> <span className="text-sm text-[color:var(--muted)]">optional</span>
        <input name="outfit" maxLength={160} placeholder="e.g. yellow raincoat and red boots" className={input} />
      </label>
      <div className="flex flex-col gap-2 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[color:var(--muted)]">We draw 3 options. About ${cost.toFixed(2)} per set.</p>
        <button disabled={pending || disabled} data-testid="start-sheet" className="btn btn-primary">
          {pending ? "Starting..." : "Draw character options"}
        </button>
      </div>
      {state?.message && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200 sm:col-span-2">
          {state.message}
        </p>
      )}
    </form>
  );
}

const BIBLE_FIELDS: Array<[keyof CharacterBible, string, string]> = [
  ["hair", "Hair", "color, length and style"],
  ["eyes", "Eyes", "color"],
  ["skinTone", "Skin tone", ""],
  ["faceShape", "Face shape", ""],
  ["glasses", "Glasses", "or \"none\""],
  ["freckles", "Freckles", "or \"none\""],
  ["signatureOutfit", "Signature outfit", ""],
  ["otherDetails", "Other details", "optional"],
];

export function BibleForm({ childId, sheetId, bible }: { childId: string; sheetId: string; bible: CharacterBible }) {
  const [state, action, pending] = useActionState(saveBibleAction, null);
  return (
    <form onSubmit={submitKeeping(action)} className="grid gap-3 sm:grid-cols-2" data-testid="bible-form">
      <input type="hidden" name="childId" value={childId} />
      <input type="hidden" name="sheetId" value={sheetId} />
      {BIBLE_FIELDS.map(([k, label, hint]) => (
        <label key={k} className="block">
          <span className="font-semibold">{label}</span> {hint && <span className="text-sm text-[color:var(--muted)]">{hint}</span>}
          <input name={k} defaultValue={bible[k]} required={k !== "otherDetails"} maxLength={240} className={input} />
        </label>
      ))}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="btn btn-primary">
          {pending ? "Saving..." : "Save details"}
        </button>
        {state?.message && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
      </div>
    </form>
  );
}
