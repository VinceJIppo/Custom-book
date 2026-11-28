import Link from "next/link";
import { Star } from "@/components/brand/Star";

export default function NotFound() {
  return (
    <div className="ss-card mx-auto w-full max-w-md space-y-4 p-6 text-center sm:p-8">
      <div className="flex items-end justify-center gap-2" aria-hidden="true">
        <Star className="h-4 w-4 rotate-[-18deg] text-persimmon" />
        <Star className="h-7 w-7 rotate-[8deg] text-buttercup" />
        <Star className="h-4 w-4 rotate-[24deg] text-delft" />
      </div>
      <p className="font-display text-4xl text-delft">Hmm...</p>
      <h1 className="heading">We couldn&apos;t find that page</h1>
      <p className="text-ink-muted">It may have been moved or deleted, or the link was mistyped.</p>
      <Link href="/" className="ss-btn ss-btn--primary">
        Go to my books
      </Link>
    </div>
  );
}
