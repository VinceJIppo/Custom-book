import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { confirmAdultAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function Welcome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (user.ageConfirmedAt) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-lg rounded-xl bg-white p-8 ring-1 ring-[color:var(--line)]">
      <h1 className="font-display text-3xl font-medium">Welcome to StoryStar</h1>
      <p className="mt-3 text-[color:var(--muted)]">
        StoryStar is for parents and family grown-ups. You create the books; your child enjoys reading them with you.
      </p>
      <form action={confirmAdultAction} className="mt-6 space-y-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" name="adult" className="mt-1 size-5 accent-[color:var(--color-cobalt)]" required />
          <span>I am 18 or older.</span>
        </label>
        {error && <p className="text-sm text-red-700">Please confirm you are 18 or older to continue.</p>}
        <button className="btn btn-primary">Continue</button>
      </form>
    </div>
  );
}
