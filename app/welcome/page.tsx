import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { confirmAdultAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Welcome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user.ageConfirmedAt) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-lg rounded-3xl bg-white p-8 shadow-sm ring-1 ring-[color:var(--line)]">
      <h1 className="font-display text-3xl font-semibold">Welcome to StoryStar</h1>
      <p className="mt-3 text-[color:var(--muted)]">
        StoryStar is for parents and family grown-ups. You create the books; your child enjoys reading them with you.
      </p>
      <form action={confirmAdultAction} className="mt-6 space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="adult" className="mt-1 size-5 accent-[color:var(--color-berry)]" required />
          <span>I am 18 or older.</span>
        </label>
        {error && <p className="text-sm text-red-700">Please confirm you are 18 or older to continue.</p>}
        <button className="rounded-full bg-berry px-5 py-2.5 font-semibold text-white">Continue</button>
      </form>
    </div>
  );
}
