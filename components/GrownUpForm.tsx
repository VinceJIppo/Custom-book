"use client";

import { useActionState, useState } from "react";
import { HAIR_LENGTHS } from "@/lib/schemas/child";
import { saveGrownUpAction } from "@/app/people/actions";
import type { SaveResult } from "@/lib/children/service";

export interface GrownUpValues {
  id?: string;
  firstName: string;
  nickname: string;
  relationship: string;
  pronouns: string;
  about: string;
  look: string;
  hairLength: string;
}

const input = "ss-input mt-1";

export function GrownUpForm({ initial }: { initial: GrownUpValues }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(saveGrownUpAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const [pronouns, setPronouns] = useState(initial.pronouns);
  const field = (name: keyof GrownUpValues, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block min-w-0">
      <span className="label">{label}</span>
      {hint && <span className="body-s ml-2 text-ink-muted">{hint}</span>}
      <input name={name} defaultValue={initial[name] ?? ""} className={input} {...props} />
      {errors[name] && <span className="body-s mt-1 block text-persimmon">{errors[name]}</span>}
    </label>
  );
  return (
    <form action={action} className="ss-card ss-card--piped space-y-5">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("firstName", "First name", undefined, { required: true, maxLength: 40, placeholder: "Bina" })}
        {field("nickname", "What the children call them", "optional", { maxLength: 40, placeholder: "Mama" })}
        {field("relationship", "Who they are to the children", undefined, { required: true, maxLength: 40, placeholder: "Mom, Dad, Grandpa, Aunt..." })}
        <div className="min-w-0">
          <span className="label">Male or female</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Male or female">
            {[
              ["he", "Male"],
              ["she", "Female"],
            ].map(([v, l]) => (
              <label key={v} className="ss-option min-h-11 items-center">
                <input type="radio" name="pronouns" value={v} defaultChecked={initial.pronouns === v} onChange={() => setPronouns(v)} required className="ss-check" />
                {l}
              </label>
            ))}
          </div>
        </div>
      </div>
      {pronouns === "she" && (
        <div>
          <span className="label">Hair length</span> <span className="body-s text-ink-muted">optional; we draw her hair this length in every picture</span>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Hair length">
            {Object.entries(HAIR_LENGTHS).map(([v, h]) => (
              <label key={v} className="group ss-option min-h-11 items-center">
                <input type="radio" name="hairLength" value={v} defaultChecked={initial.hairLength === v} className="ss-check" />
                <span>
                  {/* Muted on paper; ink once selected, since the selected card is delft wash. */}
                  {h.label} <span className="body-s text-ink-muted group-has-checked:text-ink">({h.hint})</span>
                </span>
              </label>
            ))}
          </div>
          {errors.hairLength && <span className="body-s mt-1 block text-persimmon">{errors.hairLength}</span>}
        </div>
      )}
      <label className="block">
        <span className="label">About them</span> <span className="body-s text-ink-muted">optional: their job, what they love, what they&apos;re like</span>
        <textarea name="about" defaultValue={initial.about} maxLength={300} rows={3} className={input} placeholder="A nurse who works night shifts at the children's hospital. Loves gardening and terrible jokes." />
        {errors.about && <span className="body-s mt-1 block text-persimmon">{errors.about}</span>}
      </label>
      <label className="block">
        <span className="label">How they look</span> <span className="body-s text-ink-muted">optional; only needed if you don&apos;t make a photo character</span>
        <input name="look" defaultValue={initial.look} maxLength={240} className={input} placeholder="Curly black hair, round glasses" />
        {errors.look && <span className="body-s mt-1 block text-persimmon">{errors.look}</span>}
      </label>
      {state && !state.ok && state.message && (
        <p className="ss-note ss-note--error" role="alert">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="ss-btn ss-btn--primary" data-testid="save-grownup">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
