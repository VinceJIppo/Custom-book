"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { createBookAction } from "@/app/actions";
import { ART_STYLES, ART_STYLE_LABELS, type ArtStyle } from "@/lib/schemas/theme";
import { READING_LEVELS, READING_LEVEL_RULES, STORY_LENGTHS, type ReadingLevel } from "@/lib/schemas/book";
import { DEFAULT_VOICE, VOICES, VOICE_IDS, type VoiceId } from "@/lib/schemas/voices";
import type { CostEstimate } from "@/lib/cost/estimate";

export interface WizardTheme {
  id: string;
  slug: string;
  name: string;
  pitch: string;
  palette: string[];
  defaultStyle: ArtStyle;
  ageRange: [number, number];
  cast: string[];
}

export interface WizardProps {
  child: { id: string; name: string; age: number; petName: string | null; friend: string | null; lesson: string | null };
  themes: WizardTheme[];
  defaultReadingLevel: ReadingLevel;
  estimates: Record<number, CostEstimate>;
  storyProvider: string;
  /** Art styles with an approved character for this child. */
  approvedStyles: string[];
  /** True when a real image provider is on, so a character is required. */
  needsCharacter: boolean;
}

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-berry focus:ring-2 focus:ring-violet-200";

export function BookWizard({ child, themes, defaultReadingLevel, estimates, storyProvider, approvedStyles, needsCharacter }: WizardProps) {
  const [state, action, pending] = useActionState(createBookAction, null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const theme = themes.find((t) => t.id === themeId) ?? null;
  const [style, setStyle] = useState<ArtStyle | null>(null);
  const [length, setLength] = useState(16);
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [level, setLevel] = useState<ReadingLevel>(defaultReadingLevel);
  const est = estimates[length];
  const suggested = state && !state.ok ? themes.filter((t) => state.suggestedThemeIds?.includes(t.slug)) : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-8">
      <input type="hidden" name="childId" value={child.id} />
      <input type="hidden" name="themeId" value={themeId ?? ""} />

      <section>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">1. Pick a theme</h2>
          <Link href="/themes/new" className="text-sm font-semibold text-berry underline">
            or create your own
          </Link>
        </div>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Theme">
          {themes.map((t) => {
            const selected = t.id === themeId;
            const ageOk = child.age >= t.ageRange[0] - 1 && child.age <= t.ageRange[1] + 1;
            return (
              <button
                type="button"
                key={t.id}
                role="radio"
                aria-checked={selected}
                data-testid={`theme-${t.slug}`}
                onClick={() => {
                  setThemeId(t.id);
                  setStyle((s) => s ?? ((approvedStyles[0] as ArtStyle | undefined) ?? t.defaultStyle));
                }}
                className={`overflow-hidden rounded-3xl bg-white text-left shadow-sm ring-2 transition ${selected ? "ring-berry" : "ring-transparent hover:ring-violet-200"}`}
              >
                <div className="flex h-16">
                  {t.palette.map((c) => (
                    <div key={c} className="flex-1" style={{ background: c }} />
                  ))}
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg font-semibold">{t.name}</span>
                    {selected && <span className="text-berry">✔</span>}
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--muted)]">{t.pitch.replace(/^The child/, child.name)}</p>
                  <p className="mt-2 text-xs text-[color:var(--muted)]">
                    With {t.cast.join(", ")} · ages {t.ageRange[0]} to {t.ageRange[1]}
                    {!ageOk && " · may not fit this age"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <fieldset disabled={!theme} className={theme ? "" : "opacity-40"}>
        <legend className="font-display text-xl font-semibold">2. Book options</legend>
        <div className="mt-3 grid gap-5 rounded-3xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:grid-cols-2">
          <div className="sm:col-span-2" role="radiogroup" aria-label="Story voice">
            <span className="font-semibold">Story voice</span> <span className="text-sm text-[color:var(--muted)]">how the book sounds read aloud</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {VOICE_IDS.map((id) => {
                const v = VOICES[id];
                return (
                  <label
                    key={id}
                    data-testid={`voice-${id}`}
                    className="flex cursor-pointer gap-3 rounded-2xl bg-cream p-3 ring-1 ring-[color:var(--line)] has-[:checked]:bg-violet-50 has-[:checked]:ring-berry"
                  >
                    <input type="radio" name="voice" value={id} checked={voice === id} onChange={() => setVoice(id)} className="mt-1 accent-[color:var(--color-berry)]" />
                    <span>
                      <span className="block font-semibold">
                        {v.label}
                        {id === DEFAULT_VOICE && <span className="ml-2 rounded-full bg-star px-2 py-0.5 text-xs text-ink">default</span>}
                      </span>
                      <span className="block text-sm text-[color:var(--muted)]">{v.description}</span>
                      <span className="mt-1 block whitespace-pre-line text-sm italic">{v.sample}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="font-semibold">Story length</span>
            <select name="length" value={length} onChange={(e) => setLength(Number(e.target.value))} className={input}>
              {STORY_LENGTHS.map((n) => (
                <option key={n} value={n}>
                  {n} story pages
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Reading level</span>
            <select name="readingLevel" value={level} onChange={(e) => setLevel(e.target.value as ReadingLevel)} className={input}>
              {READING_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {READING_LEVEL_RULES[l].label}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[color:var(--muted)]" data-testid="reading-rule">
              {VOICES[voice].readingLevels?.[level] ?? READING_LEVEL_RULES[level].rule}
            </span>
          </label>
          <label className="block">
            <span className="font-semibold">Art style</span>
            <select name="style" value={style ?? theme?.defaultStyle ?? "watercolor-storybook"} onChange={(e) => setStyle(e.target.value as ArtStyle)} className={input}>
              {ART_STYLES.map((s) => (
                <option key={s} value={s}>
                  {ART_STYLE_LABELS[s]}
                  {theme?.defaultStyle === s ? " (theme default)" : ""}
                  {approvedStyles.includes(s) ? " ✓ character ready" : ""}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-[color:var(--muted)]">The style is locked for the whole book.</span>
            {style && !approvedStyles.includes(style) && (
              <span className={`mt-1 block text-xs ${needsCharacter ? "font-semibold text-amber-800" : "text-[color:var(--muted)]"}`}>
                {needsCharacter ? "No approved character in this style yet. " : "Tip: create a character in this style so the hero looks like your child. "}
                <Link href={`/children/${child.id}/character`} className="underline">
                  Create one
                </Link>
              </span>
            )}
          </label>
          <label className="block">
            <span className="font-semibold">Book size</span>
            <select name="trimSize" defaultValue="square-8.5" className={input}>
              <option value="square-8.5">8.5 x 8.5 in square</option>
              <option value="portrait-8.5x11">8.5 x 11 in portrait</option>
            </select>
          </label>
          <div className="space-y-2 sm:col-span-2">
            <label className={`flex items-center gap-3 ${child.petName ? "" : "opacity-50"}`}>
              <input type="checkbox" name="includePet" defaultChecked={!!child.petName} disabled={!child.petName} className="size-5 accent-[color:var(--color-berry)]" />
              Include {child.petName ?? "a pet (add one to the profile first)"}
            </label>
            <label className={`flex items-center gap-3 ${child.friend ? "" : "opacity-50"}`}>
              <input type="checkbox" name="includeFriend" defaultChecked={!!child.friend} disabled={!child.friend} className="size-5 accent-[color:var(--color-berry)]" />
              Include best friend {child.friend ?? "(add one to the profile first)"}
            </label>
          </div>
          <label className="block">
            <span className="font-semibold">Lesson</span> <span className="text-sm text-[color:var(--muted)]">optional</span>
            <input name="lesson" defaultValue={child.lesson ?? ""} placeholder="bravery, sharing..." className={input} />
          </label>
          <label className="block">
            <span className="font-semibold">Dedication</span> <span className="text-sm text-[color:var(--muted)]">optional, or we&apos;ll write one</span>
            <input name="dedication" maxLength={300} placeholder={`For ${child.name}, with love`} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-semibold">Anything else?</span> <span className="text-sm text-[color:var(--muted)]">optional</span>
            <textarea name="instructions" maxLength={500} rows={2} placeholder="Grandma's garden should appear. Make it rhyme." className={input} />
          </label>
        </div>
      </fieldset>

      {state && !state.ok && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200" role="alert">
          <p>{state.message}</p>
          {suggested.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggested.map((t) => (
                <button type="button" key={t.id} onClick={() => setThemeId(t.id)} className="rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-amber-300">
                  Try {t.name}
                </button>
              ))}
            </div>
          )}
          {state.errors && Object.keys(state.errors).length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {Object.entries(state.errors).map(([k, v]) => (
                <li key={k}>
                  {k}: {v}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-3xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <p className="font-semibold">
            Estimated generation cost: <span data-testid="estimate">${est.totalUsd.toFixed(2)}</span>
          </p>
          <ul className="mt-1 text-[color:var(--muted)]">
            {est.lines.map((l) => (
              <li key={l.label}>
                {l.label}: ${l.usd.toFixed(2)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            High-side estimate. With a real image provider (Phase 2) this book would be about ${est.withRealImagesUsd.toFixed(2)}.
            {storyProvider === "mock" && " Stories are written by the offline mock until an Anthropic key is added."}
          </p>
        </div>
        <button disabled={!theme || pending} data-testid="create-book" className="rounded-full bg-berry px-6 py-3 font-semibold text-white shadow disabled:opacity-50">
          {pending ? "Starting..." : "Make my book ✨"}
        </button>
      </section>
    </form>
  );
}
