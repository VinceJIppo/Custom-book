import Link from "next/link";
import { Star } from "@/components/brand/Star";

export const metadata = { title: "Account deleted | StoryStar" };

/** Where a parent lands after deleting their account. */
export default async function GoodbyePage({ searchParams }: { searchParams: Promise<{ emailed?: string }> }) {
  const { emailed } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="ss-card ss-card--piped space-y-4 p-6 text-center sm:p-8" data-testid="goodbye">
        <Star className="mx-auto !h-8 !w-8 text-buttercup" />
        <h1 className="heading">Your account is deleted</h1>
        <p className="text-ink-muted">
          We&apos;ve erased your photos, characters, books and sign-in details.
          {emailed === "1" && " We've also sent a short note to your email address to confirm it."}
        </p>
        <p className="text-ink-muted">Thank you for making stories with us.</p>
        <Link href="/" className="ss-btn ss-btn--secondary">
          Go to StoryStar
        </Link>
      </div>
    </div>
  );
}
