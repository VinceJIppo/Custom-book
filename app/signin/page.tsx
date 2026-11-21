import { redirect } from "next/navigation";
import { authMode, getOptionalUser } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; signedOut?: string }> }) {
  if (authMode() === "single") redirect("/");
  if (await getOptionalUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md space-y-5 rounded-2xl bg-white p-8 ring-1 ring-[color:var(--line)]">
      <p className="eyebrow text-coral">Welcome</p>
      <h1 className="font-display text-3xl font-medium">Sign in to StoryStar</h1>
      {sp.signedOut && <p className="rounded-lg bg-sky px-3 py-2 text-sm text-navy">You&apos;re signed out.</p>}
      {sp.error && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">{sp.error}</p>}
      <SignInForm />
    </div>
  );
}
