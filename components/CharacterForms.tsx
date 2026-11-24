"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { saveBibleAction, startSheetAction, uploadPhotosAction } from "@/app/actions";
import { ART_STYLES, ART_STYLE_LABELS } from "@/lib/schemas/theme";
import type { CharacterBible } from "@/lib/schemas/story";

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

function submitKeeping(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

export function PhotoUpload({ childId, consentGiven, remaining, grownUp = false }: { childId: string; consentGiven: boolean; remaining: number; grownUp?: boolean }) {
  const [state, action, pending] = useActionState(uploadPhotosAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [tooBig, setTooBig] = useState<string | null>(null);
  if (remaining <= 0) return <p className="text-sm text-[color:var(--muted)]">You have 3 photos, the most we use. Remove one to add another.</p>;
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        // The server takes up to 25 MB per upload; bigger uploads fail before we can explain why.
        const files = Array.from((e.currentTarget.elements.namedItem("photos") as HTMLInputElement | null)?.files ?? []).slice(0, remaining);
        const mb = files.reduce((n, f) => n + f.size, 0) / 1024 / 1024;
        if (mb > 24) {
          e.preventDefault();
          setTooBig(`These photos add up to ${Math.round(mb)} MB, more than we can take at once (24 MB). Upload them one at a time, or use smaller copies.`);
          return;
        }
        setTooBig(null);
        submitKeeping(action)(e);
      }}
      className="space-y-3"
      data-testid="photo-upload"
    >
      <input type="hidden" name="childId" value={childId} />
      <input
        type="file"
        name="photos"
        multiple
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
        className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-sky file:px-4 file:py-2 file:text-xs file:font-semibold file:uppercase file:tracking-wider file:text-navy"
      />
      {!consentGiven && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="consent" required className="mt-0.5 size-5 accent-[color:var(--color-cobalt)]" />
          <span>
            {grownUp
              ? "These are photos of me, or this person has given me permission to upload them."
              : "I am this child\u2019s parent or legal guardian, or I have their permission to upload these photos."}
          </span>
        </label>
      )}
      <button disabled={pending} className="btn btn-primary">
        {pending ? "Checking photos..." : `Upload (up to ${remaining})`}
      </button>
      {tooBig && (
        <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">
          {tooBig}
        </p>
      )}
      {state?.results.map((r, i) => (
        <div key={i} role="status" className={`rounded-xl px-3 py-2 text-sm ring-1 ${r.ok ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200"}`}>
          <b>{r.name || "Photo"}:</b> {r.ok ? "added." : r.message}
          {r.problems && r.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {r.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </form>
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
