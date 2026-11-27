"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { createBookAction } from "@/app/actions";
import { CastPicker, type CastOption } from "./CastPicker";

export interface StoryCard {
  id: string;
  title: string;
  summary: string;
  /** Voice id the story is told in, and its label for the card. */
  voice: string;
  voiceLabel: string;
  picture: string | null;
}

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

/**
 * Starting a book in two questions: which story, and who's in it. Everything
 * else is set for the parent: the house theme and art style, 16 pages, the
 * reading level for the child's age, the story's own voice, the pet and best
 * friend when the profile has them, and pictures drawn right away.
 */
export function SimpleBookForm({
  child,
  themeId,
  style,
  readingLevel,
  stories,
  people,
  needsCharacter,
  heroReady,
}: {
  child: { id: string; name: string; petName: string | null; friend: string | null };
  themeId: string;
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
      <input type="hidden" name="themeId" value={themeId} />
      <input type="hidden" name="style" value={style} />
      <input type="hidden" name="length" value="16" />
      <input type="hidden" name="readingLevel" value={readingLevel} />
      <input type="hidden" name="trimSize" value="square-8.5" />
      <input type="hidden" name="pictureSpeed" value="now" />
      <input type="hidden" name="voice" value={story?.voice ?? ""} />
      {child.petName && <input type="hidden" name="includePet" value="on" />}
      {child.friend && <input type="hidden" name="includeFriend" value="on" />}

      {blocked && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200" role="alert">
          First, let&apos;s draw {child.name}: it takes a couple of photos and about a minute, and you only do it once.{" "}
          <Link href={`/children/${child.id}/character`} className="font-semibold underline">
            Add photos of {child.name}
          </Link>
        </div>
      )}

      <fieldset>
        <legend className="font-display text-2xl font-medium">1. Pick a story</legend>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" role="radiogroup" aria-label="Story">
          {stories.map((s) => (
            <label
              key={s.id}
              data-testid={`story-${s.id}`}
              className={`flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-white ring-1 transition ${storyId === s.id ? "ring-4 ring-cobalt" : "ring-[color:var(--line)] hover:ring-cobalt/50"}`}
            >
              <input type="radio" name="starterId" value={s.id} checked={storyId === s.id} onChange={() => setStoryId(s.id)} className="sr-only" />
              {s.picture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.picture} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="aspect-square w-full bg-cream" />
              )}
              <span className="block p-3 sm:p-4">
                <span className="block font-display text-base font-medium leading-snug sm:text-lg">{s.title}</span>
                <span className="mt-1 block text-xs text-[color:var(--muted)] sm:text-sm">{s.summary}</span>
                <span className="chip chip-sun mt-2 hidden sm:inline-block">{s.voiceLabel}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[color:var(--muted)]">2. {child.name} is the star</p>
        <CastPicker heroId={child.id} heroName={child.name} people={people} style={style} needsCharacter={needsCharacter} showAbout={false} />
      </div>

      <details className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <summary className="cursor-pointer font-display text-lg font-medium">
          Add a personal touch <span className="font-sans text-sm font-normal text-[color:var(--muted)]">optional</span>
        </summary>
        <div className="mt-4 grid gap-4">
          <label className="block">
            <span className="font-semibold">Dedication</span> <span className="text-sm text-[color:var(--muted)]">or we&apos;ll write one</span>
            <input name="dedication" maxLength={300} placeholder={`For ${child.name}, with love`} className={input} />
          </label>
          <label className="block">
            <span className="font-semibold">Anything we should include?</span>
            <textarea name="instructions" maxLength={500} rows={2} placeholder="Grandma's red garden boots. Theo is learning to share." className={input} />
          </label>
        </div>
      </details>

      {state && !state.ok && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200" role="alert">
          {state.message}
        </div>
      )}

      <div className="flex flex-col items-start gap-2">
        <button disabled={!story || pending || blocked} data-testid="create-book" className="btn btn-primary btn-lg">
          {pending ? "Starting..." : "Write my story ✨"}
        </button>
        <p className="text-sm text-[color:var(--muted)]">We write the story first (about two minutes). You read it before any pictures are drawn.</p>
      </div>
    </form>
  );
}
