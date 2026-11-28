"use client";

import { startTransition, useActionState } from "react";
import { draftThemeAction, saveThemeAction } from "@/app/actions";
import { ART_STYLES, ART_STYLE_LABELS, type ThemeConfig } from "@/lib/schemas/theme";
import { Star } from "@/components/brand/Star";

const input = "ss-input mt-1";
const card = "ss-card grid gap-4 sm:grid-cols-2";

function keep(action: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function FieldError({ errors, k }: { errors: Record<string, string>; k: string }) {
  const msg = errors[k] ?? Object.entries(errors).find(([key]) => key.startsWith(`${k}.`))?.[1];
  return msg ? <span className="mt-1 block text-sm font-semibold text-persimmon">{msg}</span> : null;
}

export function DraftThemeForm() {
  const [state, action, pending] = useActionState(draftThemeAction, null);
  return (
    <form onSubmit={keep(action)} className="ss-card ss-card--piped space-y-4">
      <label className="block">
        <span className="font-semibold">What does your child love?</span>
        <textarea
          name="description"
          rows={4}
          maxLength={1000}
          required
          data-testid="theme-description"
          placeholder="She's obsessed with bees and gardens, loves the color yellow, and wants to be a scientist. She gets nervous about the dark."
          className={input}
        />
      </label>
      <label className="block max-w-40">
        <span className="font-semibold">Child&apos;s age</span> <span className="text-sm text-ink-muted">optional</span>
        <input name="age" type="number" min={1} max={12} className={input} />
      </label>
      {state?.message && (
        <p role="alert" className="ss-note ss-note--error">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="ss-btn ss-btn--primary" data-testid="draft-theme">
        {!pending && <Star />}
        {pending ? "Dreaming up a world..." : "Draft my theme"}
      </button>
    </form>
  );
}

export function ThemeEditor({ themeId, config }: { themeId: string; config: ThemeConfig }) {
  const [state, action, pending] = useActionState(saveThemeAction, null);
  const err = state?.errors ?? {};
  const cast = [...config.supportingCast, ...Array(Math.max(0, 4 - config.supportingCast.length)).fill({ name: "", role: "", look: "" })].slice(0, 4);
  return (
    <form onSubmit={keep(action)} className="space-y-6" data-testid="theme-editor">
      <input type="hidden" name="themeId" value={themeId} />
      <section className={`${card} ss-card--piped`}>
        <label className="block">
          <span className="font-semibold">Name</span>
          <input name="name" defaultValue={config.name} required maxLength={60} className={input} />
          <FieldError errors={err} k="name" />
        </label>
        <label className="block">
          <span className="font-semibold">Genre</span>
          <input name="genre" defaultValue={config.genre ?? ""} maxLength={40} className={input} />
        </label>
        <label className="block sm:col-span-2">
          <span className="font-semibold">Pitch</span> <span className="text-sm text-ink-muted">one or two sentences; &quot;The child&quot; becomes your child&apos;s name</span>
          <textarea name="pitch" defaultValue={config.pitch} rows={2} maxLength={400} className={input} />
          <FieldError errors={err} k="pitch" />
        </label>
        <label className="block sm:col-span-2">
          <span className="font-semibold">Setting</span>
          <textarea name="setting" defaultValue={config.setting} rows={2} maxLength={400} className={input} />
          <FieldError errors={err} k="setting" />
        </label>
        <div className="flex gap-3">
          <label className="block min-w-0 flex-1">
            <span className="font-semibold">Ages from</span>
            <input name="ageMin" type="number" min={1} max={12} defaultValue={config.ageRange[0]} className={input} />
          </label>
          <label className="block min-w-0 flex-1">
            <span className="font-semibold">to</span>
            <input name="ageMax" type="number" min={1} max={12} defaultValue={config.ageRange[1]} className={input} />
          </label>
        </div>
        <FieldError errors={err} k="ageRange" />
      </section>

      <section className="ss-card">
        <p className="title">Supporting cast</p>
        <p className="mt-1 text-sm text-ink-muted">Original characters only. &quot;Look&quot; is what the illustrator draws.</p>
        <div className="mt-3 space-y-3">
          {cast.map((c, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
              <input name={`cast${i}name`} defaultValue={c.name} placeholder="Name" aria-label={`Cast member ${i + 1} name`} maxLength={60} className={input} />
              <input name={`cast${i}role`} defaultValue={c.role} placeholder="Role" aria-label={`Cast member ${i + 1} role`} maxLength={80} className={input} />
              <input name={`cast${i}look`} defaultValue={c.look} placeholder="Looks like..." aria-label={`Cast member ${i + 1} look`} maxLength={240} className={input} />
            </div>
          ))}
        </div>
        <FieldError errors={err} k="supportingCast" />
      </section>

      <section className={card}>
        <label className="block">
          <span className="font-semibold">Story beats</span> <span className="text-sm text-ink-muted">one per line, in order</span>
          <textarea name="storyBeats" defaultValue={config.storyBeats.join("\n")} rows={8} className={input} />
          <FieldError errors={err} k="storyBeats" />
        </label>
        <label className="block">
          <span className="font-semibold">Story rules</span> <span className="text-sm text-ink-muted">one per line</span>
          <textarea name="contentRules" defaultValue={config.contentRules.join("\n")} rows={8} className={input} />
          <FieldError errors={err} k="contentRules" />
        </label>
        <label className="block sm:col-span-2">
          <span className="font-semibold">Special-talent idea</span> <span className="text-sm text-ink-muted">optional</span>
          <input name="powerIdeas" defaultValue={config.powerIdeas ?? ""} maxLength={300} className={input} />
        </label>
      </section>

      <section className={card}>
        <label className="block">
          <span className="font-semibold">Default art style</span>
          <select name="defaultStyle" defaultValue={config.artDirection.defaultStyle} className={input}>
            {ART_STYLES.map((s) => (
              <option key={s} value={s}>
                {ART_STYLE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-semibold">Mood</span>
          <input name="mood" defaultValue={config.artDirection.mood} maxLength={200} className={input} />
        </label>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="font-semibold">Palette</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {[0, 1, 2, 3].map((i) => (
              <input key={i} type="color" name={`palette${i}`} aria-label={`Palette color ${i + 1}`} defaultValue={config.artDirection.palette[i] ?? "#FFFFFF"} className="h-12 w-16 cursor-pointer rounded-[var(--radius-sm)] border-[1.5px] border-ink-muted bg-paper-raised p-1" />
            ))}
          </div>
          <FieldError errors={err} k="artDirection.palette" />
        </fieldset>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="ss-btn ss-btn--primary" data-testid="save-theme">
          {pending ? "Saving..." : "Save theme"}
        </button>
        {state?.message && (
          <span role="status" className={`ss-note ${state.ok ? "ss-note--success" : "ss-note--error"}`}>
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
