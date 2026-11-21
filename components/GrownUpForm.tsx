"use client";

import { useActionState } from "react";
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
}

const input = "mt-1 w-full rounded-xl border border-[color:var(--line)] bg-white px-3 py-2.5 text-base outline-none focus:border-cobalt focus:ring-2 focus:ring-sky";

export function GrownUpForm({ initial }: { initial: GrownUpValues }) {
  const [state, action, pending] = useActionState<SaveResult | null, FormData>(saveGrownUpAction, null);
  const errors = state && !state.ok ? state.errors : {};
  const field = (name: keyof GrownUpValues, label: string, hint?: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="block">
      <span className="font-semibold">{label}</span>
      {hint && <span className="ml-2 text-sm text-[color:var(--muted)]">{hint}</span>}
      <input name={name} defaultValue={initial[name] ?? ""} className={input} {...props} />
      {errors[name] && <span className="mt-1 block text-sm text-red-700">{errors[name]}</span>}
    </label>
  );
  return (
    <form action={action} className="space-y-5 rounded-xl bg-white p-6 ring-1 ring-[color:var(--line)]">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid gap-5 sm:grid-cols-2">
        {field("firstName", "First name", undefined, { required: true, maxLength: 40, placeholder: "Bina" })}
        {field("nickname", "What the children call them", "optional", { maxLength: 40, placeholder: "Mama" })}
        {field("relationship", "Who they are to the children", undefined, { required: true, maxLength: 40, placeholder: "Mom, Dad, Grandpa, Aunt..." })}
        <label className="block">
          <span className="font-semibold">Pronouns</span>
          <select name="pronouns" defaultValue={initial.pronouns || "she"} className={input}>
            <option value="she">she / her</option>
            <option value="he">he / him</option>
            <option value="they">they / them</option>
          </select>
        </label>
      </div>
      <label className="block">
        <span className="font-semibold">About them</span> <span className="text-sm text-[color:var(--muted)]">optional: their job, what they love, what they&apos;re like</span>
        <textarea name="about" defaultValue={initial.about} maxLength={300} rows={3} className={input} placeholder="A nurse who works night shifts at the children's hospital. Loves gardening and terrible jokes." />
        {errors.about && <span className="mt-1 block text-sm text-red-700">{errors.about}</span>}
      </label>
      <label className="block">
        <span className="font-semibold">How they look</span> <span className="text-sm text-[color:var(--muted)]">optional; only needed if you don&apos;t make a photo character</span>
        <input name="look" defaultValue={initial.look} maxLength={240} className={input} placeholder="Long curly black hair, round glasses, a yellow raincoat" />
        {errors.look && <span className="mt-1 block text-sm text-red-700">{errors.look}</span>}
      </label>
      {state && !state.ok && state.message && (
        <p className="text-red-700" role="alert">
          {state.message}
        </p>
      )}
      <button disabled={pending} className="btn btn-primary" data-testid="save-grownup">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
