"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { createBookAction } from "@/app/actions";
import { Star } from "@/components/brand/Star";
import { CastPicker, type CastOption } from "./CastPicker";

export interface StoryCard {
  id: string;
  /** The story's own world (theme): sent with the book so the right setting and characters are used. */
  themeId: string;
  title: string;
  summary: string;
  /** Voice id the story is told in, and its label for the card. */
  voice: string;
  voiceLabel: string;
  picture: string | null;
}

const input = "ss-input mt-1";

/**
 * Starting a book in two questions: which story, and who's in it. Everything
 * else is set for the parent: the story's own world, the house art style, 16 pages, the
 * reading level for the child's age, the story's own voice, the pet and best
 * friend when the profile has them, and pictures drawn right away.
 */
export function SimpleBookForm({
  child,
  style,
  readingLevel,
  stories,
  people,
  needsCharacter,
  heroReady,
}: {
  child: { id: string; name: string; petName: string | null; friend: string | null };
  style: string;
  readingLevel: string;
  stories: StoryCard[];
  people: CastOption[];
  needsCharacter: boolean;
  /** The child already has a character in the house style. */
  heroReady: boolean;
}) {
  const [state, action, pending] = useActionState(createBookAction, null);
  const [storyId, setStoryId] = useState<string>(stories[0]?.id ?? "");
  const story = stories.find((s) => s.id === storyId);
  const blocked = needsCharacter && !heroReady;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-8"
      data-testid="simple-book-form"
    >
      <input type="hidden" name="childId" value={child.id} />
      <input type="hidden" name="themeId" value={story?.themeId ?? ""} />
      <input type="hidden" name="style" value={style} />
      <input type="hidden" name="length" value="16" />
      <input type="hidden" name="readingLevel" value={readingLevel} />
      <input type="hidden" name="trimSize" value="square-8.5" />
      <input type="hidden" name="pictureSpeed" value="now" />
      <input type="hidden" name="voice" value={story?.voice ?? ""} />
      {child.petName && <input type="hidden" name="includePet" value="on" />}
      {child.friend && <input type="hidden" name="includeFriend" value="on" />}

      {blocked && (
        <div className="ss-note ss-note--warn" role="alert">
          First, let&apos;s draw {child.name}: it takes a couple of photos and about a minute, and you only do it once.{" "}
          <Link href={`/children/${child.id}/character`} className="ss-link">
            Add photos of {child.name}
          </Link>
        </div>
      )}

      <fieldset className="min-w-0">
        <legend className="title">1. Pick a story</legend>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3" role="radiogroup" aria-label="Story">
          {stories.map((s) => {
            const selected = storyId === s.id;
            return (
              <label
                key={s.id}
                data-testid={`story-${s.id}`}
                className={`ss-book relative w-auto cursor-pointer gap-2 sm:gap-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-[color:var(--focus-ring)] ${selected ? "border-2 border-delft p-[9px] sm:p-[15px]" : "p-2.5 hover:border-delft sm:p-4"}`}
              >
                <input type="radio" name="starterId" value={s.id} checked={selected} onChange={() => setStoryId(s.id)} className="sr-only" />
                <span className="relative block">
                  {s.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.picture} alt="" className="block aspect-square w-full rounded-[var(--radius-book)] object-cover" />
                  ) : (
                    <span className="block aspect-square w-full rounded-[var(--radius-book)] bg-paper-sunk" />
                  )}
                  {selected && (
                    <span className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-paper-raised text-persimmon shadow-lift">
                      <Star />
                    </span>
                  )}
                </span>
                <span className="ss-book__title block px-1 text-[17px] leading-[23px] sm:text-[21px] sm:leading-[27px]">{s.title}</span>
                <span className="ss-book__detail block text-sm sm:text-[15px]">{s.summary}</span>
                <span className="ss-pill mx-1 hidden self-start sm:inline-flex">{s.voiceLabel}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <CastPicker heroId={child.id} heroName={child.name} people={people} style={style} needsCharacter={needsCharacter} showAbout={false} step={2} />

      <details className="ss-card">
        <summary className="ss-summary title">
          Add a personal touch <span className="font-sans text-sm text-ink-muted">optional</span>
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="font-semibold">Dedication</span> <span className="text-sm text-ink-muted">or we&apos;ll write one</span>
            <input name="dedication" maxLength={300} placeholder={`For ${child.name}, with love`} className={input} />
          </label>
          <label className="block">
            <span className="font-semibold">Anything we should include?</span>
            <textarea name="instructions" maxLength={500} rows={2} placeholder="Grandma's red garden boots. Theo is learning to share." className={input} />
          </label>
        </div>
      </details>

      {state && !state.ok && (
        <div className="ss-note ss-note--error" role="alert">
          {state.message}
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <button disabled={!story || pending || blocked} data-testid="create-book" className="ss-btn ss-btn--primary w-full sm:w-auto">
          {!pending && <Star />}
          {pending ? "Starting..." : "Write my story"}
        </button>
        <p className="text-sm text-ink-muted">We write the story first (about two minutes). You read it before any pictures are drawn.</p>
      </div>
    </form>
  );
}
