"use client";

import { startTransition, useActionState } from "react";
import { saveChildAction } from "@/app/actions";
import { LESSONS } from "@/lib/schemas/child";

export interface ChildFormValues {
  id?: string;
  firstName: string;
  nickname: string;
  age: number | "";
  pronouns: string;
  colors: string;
  animals: string;
  foods: string;
  activities: string;
  petName: string;
  petType: string;
  friends: string;
  lesson: string;
}

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 text-base outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-semibold">{label}</span>
      {hint && <span className="ml-2 text-sm text-[color:var(--muted)]">{hint}</span>}
      {children}
      {error && <span className="mt-1 block text-sm text-red-700">{error}</span>}
    </label>
  );
}

export function ChildForm({ initial }: { initial: ChildFormValues }) {
  const [state, action, pending] = useActionState(saveChildAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const isPresetLesson = !initial.lesson || (LESSONS as readonly string[]).includes(initial.lesson);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
      className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state && !state.ok && state.message && (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200" role="alert">
          {state.message}
        </div>
      )}

      <fieldset className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:grid-cols-2">
        <legend className="px-1 font-display text-lg font-medium">About your child</legend>
        <Field label="First name" error={errors.firstName}>
          <input name="firstName" required defaultValue={initial.firstName} className={input} autoComplete="off" />
        </Field>
        <Field label="Nickname" hint="optional, used in the story" error={errors.nickname}>
          <input name="nickname" defaultValue={initial.nickname} className={input} autoComplete="off" />
        </Field>
        <Field label="Age" error={errors.age}>
          <input name="age" type="number" min={1} max={12} required defaultValue={initial.age} className={input} />
        </Field>
        <div>
          <span className="font-semibold">Male or female</span>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label="Male or female">
            {[
              ["he", "Male"],
              ["she", "Female"],
            ].map(([v, l]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md bg-cream px-3 py-2 ring-1 ring-[color:var(--line)] has-[:checked]:bg-sky has-[:checked]:ring-cobalt">
                <input type="radio" name="pronouns" value={v} defaultChecked={initial.pronouns === v} required className="accent-[color:var(--color-cobalt)]" />
                {l}
              </label>
            ))}
          </div>
          {errors.pronouns && <span className="mt-1 block text-sm text-red-700">{errors.pronouns}</span>}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:grid-cols-2">
        <legend className="px-1 font-display text-lg font-medium">Favorite things</legend>
        <p className="text-sm text-[color:var(--muted)] sm:col-span-2">Separate with commas. These get woven into the story.</p>
        <Field label="Colors" error={errors["favorites.colors"]}>
          <input name="colors" defaultValue={initial.colors} placeholder="purple, gold" className={input} />
        </Field>
        <Field label="Animals" error={errors["favorites.animals"]}>
          <input name="animals" defaultValue={initial.animals} placeholder="otters, owls" className={input} />
        </Field>
        <Field label="Foods" error={errors["favorites.foods"]}>
          <input name="foods" defaultValue={initial.foods} placeholder="pancakes, strawberries" className={input} />
        </Field>
        <Field label="Activities" error={errors["favorites.activities"]}>
          <input name="activities" defaultValue={initial.activities} placeholder="dancing, building forts" className={input} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)] sm:grid-cols-2">
        <legend className="px-1 font-display text-lg font-medium">Pets, friends and a lesson</legend>
        <Field label="Pet's name" hint="optional" error={errors.petName}>
          <input name="petName" defaultValue={initial.petName} className={input} />
        </Field>
        <Field label="Pet type" hint="dog, cat, bunny..." error={errors.petType}>
          <input name="petType" defaultValue={initial.petType} className={input} />
        </Field>
        <Field label="Best friends" hint="first names, commas" error={errors.friends}>
          <input name="friends" defaultValue={initial.friends} className={input} />
        </Field>
        <Field label="A lesson to weave in" hint="optional" error={errors.lesson}>
          <select name="lesson" defaultValue={isPresetLesson ? initial.lesson : "__other"} className={input}>
            <option value="">None</option>
            {LESSONS.map((l) => (
              <option key={l} value={l}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </option>
            ))}
            <option value="__other">Something else...</option>
          </select>
          <input name="lessonOther" defaultValue={isPresetLesson ? "" : initial.lesson} placeholder="If something else, describe it" className={`${input} mt-2`} />
        </Field>
      </fieldset>

      <button disabled={pending} className="btn btn-primary btn-lg">
        {pending ? "Saving..." : initial.id ? "Save changes" : "Save child"}
      </button>
    </form>
  );
}
