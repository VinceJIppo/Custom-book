import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl bg-white p-8 text-center ring-1 ring-[color:var(--line)]">
      <p className="font-display text-4xl text-coral">Hmm...</p>
      <h1 className="font-display text-2xl font-medium">We couldn&apos;t find that page</h1>
      <p className="text-[color:var(--muted)]">It may have been moved or deleted, or the link was mistyped.</p>
      <Link href="/" className="btn btn-primary">
        Go to my books
      </Link>
    </div>
  );
}
