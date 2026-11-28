"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { createBookAction } from "@/app/actions";
import { ART_STYLES, ART_STYLE_LABELS, type ArtStyle } from "@/lib/schemas/theme";
import { READING_LEVELS, READING_LEVEL_RULES, STORY_LENGTHS, type ReadingLevel } from "@/lib/schemas/book";
import { DEFAULT_VOICE, VOICES, VOICE_IDS, type VoiceId } from "@/lib/schemas/voices";
import type { CostEstimate } from "@/lib/cost/estimate";
import { Star } from "@/components/brand/Star";
import { CastPicker, type CastOption } from "./CastPicker";
import { ThemeSamples } from "./ThemeSamples";

export interface WizardTheme {
  id: string;
  slug: string;
  name: string;
  pitch: string;
  palette: string[];
  defaultStyle: ArtStyle;
  ageRange: [number, number];
  cast: string[];
  /** Sample page pictures for the card. */
  samples?: string[];
  /** Ready-made story ideas for this theme. */
  starters?: Array<{ id: string; title: string; idea: string }>;
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
  /** Other people who can be in the story. */
  people: CastOption[];
}

const input = "ss-input mt-1";

export function BookWizard({ child, themes, defaultReadingLevel, estimates, storyProvider, approvedStyles, needsCharacter, people }: WizardProps) {
  const [state, action, pending] = useActionState(createBookAction, null);
  const [themeId, setThemeId] = useState<string | null>(null);
  const theme = themes.find((t) => t.id === themeId) ?? null;
  const [style, setStyle] = useState<ArtStyle | null>(null);
  const [length, setLength] = useState(16);
  const [voice, setVoice] = useState<VoiceId>(DEFAULT_VOICE);
  const [level, setLevel] = useState<ReadingLevel>(defaultReadingLevel);
  const [speed, setSpeed] = useState<"now" | "overnight">("now");
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
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="title">1. Pick a theme</h2>
          <Link href="/themes/new" className="ss-link text-sm">
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
                className={`min-w-0 overflow-hidden rounded-[var(--radius-md)] border-2 bg-paper-raised text-left transition ${selected ? "border-delft" : "border-line hover:border-delft"}`}
              >
                <ThemeSamples samples={t.samples} palette={t.palette} name={t.name} />
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="title">{t.name}</span>
                    {selected && <Star className="text-persimmon" />}
                  </div>
                  <p className="mt-1 text-sm text-ink-muted">{t.pitch.replace(/^The child/, child.name)}</p>
                  <p className="mt-2 text-xs text-ink-muted">
                    With {t.cast.join(", ")} · ages {t.ageRange[0]} to {t.ageRange[1]}
                    {!ageOk && " · may not fit this age"}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {theme?.starters?.length ? (
        <fieldset key={theme.id} data-testid="starters" className="min-w-0">
          <legend className="title">Pick a story</legend>
          <p className="mt-1 text-sm text-ink-muted">
            A ready-made story is written faster and has been tried and tested. Either way it&apos;s written fresh around {child.name} and everyone you add.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {theme.starters.map((st, i) => (
              <label key={st.id} className="ss-option min-w-0">
                <input type="radio" name="starterId" value={st.id} defaultChecked={i === 0} className="ss-check mt-0.5 shrink-0" data-testid={`starter-${st.id}`} />
                <span className="min-w-0">
                  <span className="block font-semibold">{st.title}</span>
                  <span className="mt-1 block text-sm text-ink-muted">{st.idea.replace(/\bthe child\b/gi, child.name)}</span>
                </span>
              </label>
            ))}
            <label className="ss-option min-w-0">
              <input type="radio" name="starterId" value="" className="ss-check mt-0.5 shrink-0" data-testid="starter-new" />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold">
                  A brand-new story <span className="ss-pill ss-pill--attention">Experimental</span>
                </span>
                <span className="mt-1 block text-sm text-ink-muted">We invent a new plot just for {child.name}. Takes a little longer, and results can vary more than a ready-made story.</span>
              </span>
            </label>
          </div>
        </fieldset>
      ) : null}

      <CastPicker heroId={child.id} heroName={child.name} people={people} style={style ?? theme?.defaultStyle ?? null} needsCharacter={needsCharacter} />

      <fieldset disabled={!theme} className={`min-w-0 ${theme ? "" : "opacity-40"}`}>
        <legend className="title">2. Book options</legend>
        <div className="ss-card mt-3 grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2" role="radiogroup" aria-label="Story voice">
            <span className="font-semibold">Story voice</span> <span className="text-sm text-ink-muted">how the book sounds read aloud</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {VOICE_IDS.map((id) => {
                const v = VOICES[id];
                return (
                  <label
                    key={id}
                    data-testid={`voice-${id}`}
                    className="ss-option min-w-0"
                  >
                    <input type="radio" name="voice" value={id} checked={voice === id} onChange={() => setVoice(id)} className="ss-check mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-semibold">
                        {v.label}
                        {id === DEFAULT_VOICE && <span className="ss-pill ml-2">default</span>}
                      </span>
                      <span className="block text-sm text-ink-muted">{v.description}</span>
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
            <span className="mt-1 block text-xs text-ink-muted" data-testid="reading-rule">
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
            <span className="mt-1 block text-xs text-ink-muted">The style is locked for the whole book.</span>
            {style && !approvedStyles.includes(style) && (
              <span className={needsCharacter ? "ss-note ss-note--warn mt-2" : "mt-1 block text-xs text-ink-muted"}>
                {needsCharacter ? "No approved character in this style yet. " : "Tip: create a character in this style so the hero looks like your child. "}
                <Link href={`/children/${child.id}/character`} className="ss-link">
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
            <label className={`flex min-h-11 items-center gap-3 ${child.petName ? "cursor-pointer" : "opacity-50"}`}>
              <input type="checkbox" name="includePet" defaultChecked={!!child.petName} disabled={!child.petName} className="ss-check shrink-0" />
              Include {child.petName ?? "a pet (add one to the profile first)"}
            </label>
            <label className={`flex min-h-11 items-center gap-3 ${child.friend ? "cursor-pointer" : "opacity-50"}`}>
              <input type="checkbox" name="includeFriend" defaultChecked={!!child.friend} disabled={!child.friend} className="ss-check shrink-0" />
              Include best friend {child.friend ?? "(add one to the profile first)"}
            </label>
          </div>
          <label className="block">
            <span className="font-semibold">Lesson</span> <span className="text-sm text-ink-muted">optional</span>
            <input name="lesson" defaultValue={child.lesson ?? ""} placeholder="bravery, sharing..." className={input} />
          </label>
          <label className="block">
            <span className="font-semibold">Dedication</span> <span className="text-sm text-ink-muted">optional, or we&apos;ll write one</span>
            <input name="dedication" maxLength={300} placeholder={`For ${child.name}, with love`} className={input} />
          </label>
          <label className="block sm:col-span-2">
            <span className="font-semibold">Anything else?</span> <span className="text-sm text-ink-muted">optional</span>
            <textarea name="instructions" maxLength={500} rows={2} placeholder="Grandma's garden should appear. Make it rhyme." className={input} />
          </label>
        </div>
      </fieldset>

      <fieldset className="min-w-0">
        <legend className="title">When should we draw the pictures?</legend>
        <p className="mt-1 text-sm text-ink-muted">You&apos;ll read the story first either way. Pictures start after you approve it.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Picture speed">
          {(
            [
              { id: "now", title: "Right away", text: "Pictures are ready in about 10 to 20 minutes." },
              { id: "overnight", title: "Overnight, about half the cost", text: "Pictures are drawn in Google's slower queue, usually within a few hours and always within a day. We'll email you when your book is ready." },
            ] as const
          ).map((o) => (
            <label key={o.id} className="ss-option min-w-0">
              <input type="radio" name="pictureSpeed" value={o.id} checked={speed === o.id} onChange={() => setSpeed(o.id)} className="ss-check mt-0.5 shrink-0" data-testid={`speed-${o.id}`} />
              <span className="min-w-0">
                <span className="block font-semibold">{o.title}</span>
                <span className="block text-sm text-ink-muted">{o.text}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {state && !state.ok && (
        <div className="ss-note ss-note--error" role="alert">
          <p>{state.message}</p>
          {suggested.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {suggested.map((t) => (
                <button type="button" key={t.id} onClick={() => setThemeId(t.id)} className="ss-btn ss-btn--secondary ss-btn--sm">
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

      <section className="ss-card ss-card--piped flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            Estimated cost to make: <span data-testid="estimate">${est.totalUsd.toFixed(2)}</span>
          </p>
          <ul className="mt-1 text-ink-muted">
            {est.lines.map((l) => (
              <li key={l.label}>
                {l.label}: ${l.usd.toFixed(2)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink-muted">
            High-side estimate. With a real image provider this book would be about ${est.withRealImagesUsd.toFixed(2)}.
            {storyProvider === "mock" && " Stories are written by the offline mock until an Anthropic key is added."}
          </p>
        </div>
        <button disabled={!theme || pending} data-testid="create-book" className="ss-btn ss-btn--primary w-full shrink-0 sm:w-auto">
          {!pending && <Star />}
          {pending ? "Starting..." : "Make my book"}
        </button>
      </section>
    </form>
  );
}
