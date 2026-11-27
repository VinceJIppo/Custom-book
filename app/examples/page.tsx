/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth";
import { Star } from "@/components/brand/Star";

export const dynamic = "force-dynamic";
export const metadata = { title: "Peek inside a StoryStar book" };

/** Pages from a sample book made with StoryStar. Swap the files in public/examples/ to change them. */
const SAMPLE = {
  title: "Charlie and the Stream That Goes",
  spread: { src: "/examples/charlie/spread.jpg", alt: "A two-page spread: Charlie and her brothers by the stream" },
  pages: [
    { src: "/examples/charlie/title.jpg", alt: "The title page" },
    { src: "/examples/charlie/meadow.jpg", alt: "Charlie and her brothers in the meadow" },
    { src: "/examples/charlie/oak.jpg", alt: "Meeting woodland friends at the old oak" },
    { src: "/examples/charlie/stones.jpg", alt: "Crossing the stepping stones" },
    { src: "/examples/charlie/pond.jpg", alt: "A pink pond at sunset" },
    { src: "/examples/charlie/lantern.jpg", alt: "Friends on the log bench at night" },
  ],
};

/** Peek inside: pages from a real sample book. */
export default async function ExamplesPage() {
  const user = await getOptionalUser();
  const startHref = user ? "/books/new" : "/signin";
  return (
    <div className="space-y-12">
      <div className="max-w-2xl">
        <p className="ss-eyebrow">Peek inside</p>
        <h1 className="ss-h1 !mb-4">their name, their face, on every page</h1>
        <p className="ss-lede">
          Pages from <span className="italic">{SAMPLE.title}</span>, a sample book starring a one-year-old and her big brothers. Every page is illustrated from the family&apos;s photos, with a story written to be read aloud.
        </p>
      </div>
      <figure className="m-0">
        <img src={SAMPLE.spread.src} alt={SAMPLE.spread.alt} className="block w-full rounded-[var(--radius-book)] shadow-book" />
      </figure>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6">
        {SAMPLE.pages.map((p) => (
          <li key={p.src} className="overflow-hidden rounded-[var(--radius-book)] bg-paper-raised shadow-book">
            <img src={p.src} alt={p.alt} loading="lazy" className="block aspect-square w-full object-cover" />
          </li>
        ))}
      </ul>
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Link href={startHref} className="ss-btn ss-btn--primary">
          <Star />
          Make their book
        </Link>
        <Link href="/#how" className="ss-link">
          How it works
        </Link>
      </div>
    </div>
  );
}
