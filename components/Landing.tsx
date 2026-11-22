/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ART_STYLE_LABELS, type ArtStyle } from "@/lib/schemas/theme";

/** Example pages shown on the home page. Swap the files in public/examples/ to change them. */
const EXAMPLE = {
  title: "Charlie and the Stream That Goes",
  style: "Gentle ink & wash",
  theme: "Quiet Meadow",
  spread: "/examples/charlie/spread.jpg",
  pages: [
    { src: "/examples/charlie/title.jpg", alt: "Title page" },
    { src: "/examples/charlie/meadow.jpg", alt: "Charlie and her brothers in the meadow" },
    { src: "/examples/charlie/oak.jpg", alt: "Meeting woodland friends at the old oak" },
    { src: "/examples/charlie/stones.jpg", alt: "Crossing the stepping stones" },
    { src: "/examples/charlie/pond.jpg", alt: "A pink pond at sunset" },
    { src: "/examples/charlie/lantern.jpg", alt: "Friends on the log bench at night" },
  ],
};

const STEPS = [
  { n: "1", title: "Tell us about your child", text: "Their name, age and favorite things, plus a few photos so the pictures look like them. Add grown-ups and siblings as co-stars." },
  { n: "2", title: "Read the story first", text: "We write a story with a real beginning, middle and end. Change any words you like before a single picture is painted." },
  { n: "3", title: "Watch it come to life", text: "Every page is painted in the style you choose. Read it on screen, then order a beautiful printed hardcover." },
];

const STYLES: ArtStyle[] = ["painted-whimsy", "gentle-ink-wash", "watercolor-storybook", "whimsical-ink", "bold-comic", "soft-3d"];

export function Landing({ signedIn, startHref }: { signedIn: boolean; startHref: string }) {
  return (
    <div className="-mt-2 space-y-20 pb-8">
      {/* Hero */}
      <section className="relative grid items-center gap-10 overflow-hidden rounded-3xl bg-sky px-6 py-12 sm:px-12 lg:grid-cols-[1fr_1.15fr]">
        <div aria-hidden className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-bluebell/50" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-10 h-64 w-64 rounded-full bg-pink/25" />
        <div className="relative space-y-5">
          <p className="eyebrow text-coral">Personalized picture books</p>
          <h1 className="font-display text-4xl font-medium leading-tight text-navy sm:text-5xl">
            A storybook where <em className="text-coral">your child</em> is the hero
          </h1>
          <p className="max-w-md text-lg text-navy/80">
            Real stories with heart, painted pages that look like your little one, and a keepsake hardcover to read again and again.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={startHref} className="btn btn-primary btn-lg" data-testid="landing-start">
              {signedIn ? "Make a book" : "Start your book"}
            </Link>
            <a href="#example" className="btn btn-secondary btn-lg bg-white">
              See an example
            </a>
          </div>
        </div>
        <figure className="relative">
          <div className="rotate-1 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-black/5">
            <img src={EXAMPLE.spread} alt="A two-page spread from an example book" className="w-full rounded-xl" />
          </div>
          <figcaption className="mt-3 text-center text-sm text-navy/70">
            From <span className="italic">{EXAMPLE.title}</span>
          </figcaption>
        </figure>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-center font-display text-3xl font-medium">How it works</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl bg-white p-6 ring-1 ring-[color:var(--line)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-coral font-display text-lg text-white">{s.n}</span>
              <h3 className="mt-4 font-display text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-[color:var(--muted)]">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Example book */}
      <section id="example" className="scroll-mt-24 space-y-6">
        <div className="text-center">
          <p className="eyebrow text-coral">An example book</p>
          <h2 className="font-display text-3xl font-medium italic">{EXAMPLE.title}</h2>
          <p className="mt-1 text-[color:var(--muted)]">
            {EXAMPLE.theme} theme · {EXAMPLE.style} style · starring a one-year-old and her big brothers
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {EXAMPLE.pages.map((p, i) => (
            <li key={p.src} className={`overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-black/5 transition hover:-translate-y-1 hover:shadow-lg ${i % 2 ? "sm:translate-y-4" : ""}`}>
              <img src={p.src} alt={p.alt} loading="lazy" className="aspect-square w-full object-cover" />
            </li>
          ))}
        </ul>
      </section>

      {/* Styles */}
      <section className="space-y-5 rounded-3xl bg-cream px-6 py-10 text-center sm:px-12">
        <h2 className="font-display text-3xl font-medium">Painted your way</h2>
        <p className="mx-auto max-w-xl text-[color:var(--muted)]">
          Choose a look for every book, from delicate hand-painted whimsy to bold, bright comics. Your child&apos;s character is drawn to match.
        </p>
        <ul className="flex flex-wrap justify-center gap-2">
          {STYLES.map((s) => (
            <li key={s} className="rounded-full bg-white px-4 py-1.5 text-sm ring-1 ring-[color:var(--line)]">
              {ART_STYLE_LABELS[s]}
            </li>
          ))}
        </ul>
      </section>

      {/* Closing call to action */}
      <section className="rounded-3xl bg-navy px-6 py-12 text-center text-white sm:px-12">
        <h2 className="font-display text-3xl font-medium !text-white">Make a book they&apos;ll keep forever</h2>
        <p className="mx-auto mt-2 max-w-lg text-white/80">Every new account starts with free credits to write and paint your first story.</p>
        <Link href={startHref} className="btn btn-lg mt-6 inline-flex bg-coral text-white hover:bg-pink">
          {signedIn ? "Make a book" : "Start your book"}
        </Link>
      </section>
    </div>
  );
}
