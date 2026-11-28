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

const input = "ss-input mt-1";

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      {hint && <span className="body-s ml-2 text-ink-muted">{hint}</span>}
      {children}
      {error && <span className="body-s mt-1 block text-persimmon">{error}</span>}
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
        <div className="ss-note ss-note--error" role="alert">
          {state.message}
        </div>
      )}

      <div className="ss-card ss-card--piped">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="title mb-4">About your child</legend>
          <Field label="First name" error={errors.firstName}>
            <input name="firstName" required defaultValue={initial.firstName} className={input} autoComplete="off" />
          </Field>
          <Field label="Nickname" hint="optional, used in the story" error={errors.nickname}>
            <input name="nickname" defaultValue={initial.nickname} className={input} autoComplete="off" />
          </Field>
          <Field label="Age" error={errors.age}>
            <input name="age" type="number" min={1} max={12} required defaultValue={initial.age} className={input} />
          </Field>
          <div className="min-w-0">
            <span className="label">Male or female</span>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Male or female">
              {[
                ["he", "Male"],
                ["she", "Female"],
              ].map(([v, l]) => (
                <label key={v} className="ss-option min-h-11 items-center">
                  <input type="radio" name="pronouns" value={v} defaultChecked={initial.pronouns === v} required className="ss-check" />
                  {l}
                </label>
              ))}
            </div>
            {errors.pronouns && <span className="body-s mt-1 block text-persimmon">{errors.pronouns}</span>}
          </div>
        </fieldset>
      </div>

      <details
        open={!!initial.id || Object.keys(errors).some((k) => !["firstName", "nickname", "age", "pronouns"].includes(k))}
        className="ss-card group space-y-4"
      >
        <summary className="ss-summary title">
          More about them <span className="body-s text-ink-muted">optional: favorite things, a pet, friends, a lesson</span>
        </summary>
      <fieldset className="mt-4 grid gap-4 sm:grid-cols-2">
        <legend className="title mb-2">Favorite things</legend>
        <p className="body-s text-ink-muted sm:col-span-2">Separate with commas. These get woven into the story.</p>
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

      <fieldset className="mt-8 grid gap-4 sm:grid-cols-2">
        <legend className="title mb-4">Pets, friends and a lesson</legend>
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
          <input name="lessonOther" defaultValue={isPresetLesson ? "" : initial.lesson} placeholder="If something else, describe it" aria-label="Another lesson" className={`${input} mt-2`} />
        </Field>
      </fieldset>
      </details>

      <button disabled={pending} className="ss-btn ss-btn--primary">
        {pending ? "Saving..." : initial.id ? "Save changes" : "Next: add photos"}
      </button>
    </form>
  );
}
