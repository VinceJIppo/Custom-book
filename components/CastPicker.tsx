"use client";

import { useState } from "react";
import Link from "next/link";

export interface CastOption {
  id: string;
  name: string;
  /** "Mom", "Grandpa", or "child, 7" */
  label: string;
  kind: "child" | "grownup";
  approvedStyles: string[];
  hasLook: boolean;
}

const IDEAS = [
  "Mom is secretly a superhero, and the child doesn't know it until the very end.",
  "What Dad does at work as a nurse, and why it matters.",
  "Grandma comes to stay while the baby is born.",
  "Moving to a new house, and finding that home is the people you love.",
];

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

/** Pick other real people for the book, their part, who the story centers on, and what it's about. */
export function CastPicker({ heroId, heroName, people, style, needsCharacter }: { heroId: string; heroName: string; people: CastOption[]; style: string | null; needsCharacter: boolean }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [about, setAbout] = useState("");
  const [showAll, setShowAll] = useState(false);
  // Grown-ups first, then other children; long lists collapse.
  const sorted = [...people].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "grownup" ? -1 : 1));
  const LIMIT = 6;
  const visible = showAll ? sorted : sorted.filter((p, i) => i < LIMIT || picked.includes(p.id));
  const chosen = people.filter((p) => picked.includes(p.id));
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-medium">Who else is in the story?</h2>
        <p className="text-sm text-[color:var(--muted)]">
          Optional. Add a parent, grandparent or sibling. <Link href="/people/new" className="text-cobalt underline">Add a grown-up</Link>
        </p>
      </div>
      {people.length === 0 ? (
        <p className="rounded-xl bg-cream p-4 text-sm">No one else yet. Add a grown-up (like Mom or Grandpa) to make a story about them and {heroName} together.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {visible.map((p) => {
            const on = picked.includes(p.id);
            const missingArt = needsCharacter && style && !p.approvedStyles.includes(style) && !p.hasLook;
            return (
              <div key={p.id} className={`rounded-xl p-3 ring-1 ${on ? "bg-tint ring-cobalt" : "bg-white ring-[color:var(--line)]"}`}>
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="cast"
                    value={p.id}
                    checked={on}
                    disabled={!on && picked.length >= 3}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))}
                    className="size-5"
                    data-testid={`cast-${p.name}`}
                  />
                  <span>
                    <span className="font-semibold">{p.name}</span> <span className="text-sm text-[color:var(--muted)]">{p.label}</span>
                  </span>
                </label>
                {on && (
                  <label className="mt-2 block text-sm">
                    Their part in this story <span className="text-[color:var(--muted)]">(optional)</span>
                    <textarea name={`part_${p.id}`} maxLength={300} rows={2} className={input} placeholder={`${p.name} is secretly a superhero, and ${heroName} doesn't know it.`} />
                  </label>
                )}
                {on && missingArt && (
                  <p className="mt-2 text-sm text-amber-800">
                    {p.name} needs a character in this art style, or a short description of how they look.{" "}
                    <Link href={`/children/${p.id}/character`} className="underline">
                      Create one
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!showAll && sorted.length > visible.length && (
        <button type="button" onClick={() => setShowAll(true)} className="text-sm font-semibold text-cobalt underline">
          Show all {sorted.length} people
        </button>
      )}
      {chosen.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="font-semibold">Who is the story mostly about?</legend>
          <div className="flex flex-wrap gap-3">
            {[{ id: heroId, name: heroName }, ...chosen].map((p, i) => (
              <label key={p.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 ring-1 ring-[color:var(--line)] has-[:checked]:bg-tint has-[:checked]:ring-cobalt">
                <input type="radio" name="spotlightId" value={p.id} defaultChecked={i === 0} />
                {p.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="font-semibold">What should the story be about?</span> <span className="text-sm text-[color:var(--muted)]">optional; otherwise the theme decides</span>
        <textarea name="storyAbout" maxLength={400} rows={2} value={about} onChange={(e) => setAbout(e.target.value)} className={input} placeholder="A parent's job, a family secret, a big change coming up..." />
      </label>
      <div className="flex flex-wrap gap-2">
        {IDEAS.map((idea) => (
          <button type="button" key={idea} className="chip text-left normal-case tracking-normal" onClick={() => setAbout(idea)}>
            {idea}
          </button>
        ))}
      </div>
    </section>
  );
}
