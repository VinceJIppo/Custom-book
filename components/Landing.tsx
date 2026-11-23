/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { ART_STYLE_LABELS, type ArtStyle } from "@/lib/schemas/theme";
import { ScrollBand } from "./ScrollBand";

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
  bands: {
    boats: "/examples/bands/boats.jpg",
    oak: "/examples/bands/oak.jpg",
    lantern: "/examples/bands/lantern.jpg",
  },
};

const STEPS = [
  { n: "1", pipe: "pipe-pink", dot: "bg-pink", title: "Tell us about your child", text: "Their name, age and favorite things, plus a few photos so the pictures look like them. Add grown-ups and siblings as co-stars." },
  { n: "2", pipe: "pipe-tangerine", dot: "bg-tangerine", title: "Read the story first", text: "We write a story with a real beginning, middle and end. Change any words you like before a single picture is painted." },
  { n: "3", pipe: "pipe-mint", dot: "bg-mint", title: "Watch it come to life", text: "Every page is painted in the style you choose. Read it on screen, then order a beautiful printed hardcover." },
];

const FRAMES = ["frame-candy", "frame-candy-blue", "frame-candy-olive"];

const STYLES: ArtStyle[] = ["painted-whimsy", "gentle-ink-wash", "watercolor-storybook", "whimsical-ink", "bold-comic", "soft-3d"];

export function Landing({ signedIn, startHref }: { signedIn: boolean; startHref: string }) {
  const cta = signedIn ? "Make a book" : "Start your book";
  return (
    <div className="-mt-8 pb-4 sm:-mt-12">
      {/* Hero */}
      <section className="full-bleed scallop-bottom confetti bg-sky [--scallop:var(--color-sky)]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-12 sm:px-10 lg:grid-cols-[1fr_1.15fr]">
          <div className="space-y-5">
            <p className="eyebrow text-coral">Personalized picture books</p>
            <h1 className="font-display text-4xl font-medium leading-tight text-navy sm:text-5xl">
              A storybook where <em className="text-coral">your child</em> is the hero
            </h1>
            <p className="max-w-md text-lg text-navy/80">
              Real stories with heart, painted pages that look like your little one, and a keepsake hardcover to read again and again.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={startHref} className="btn btn-primary btn-lg" data-testid="landing-start">
                {cta}
              </Link>
              <a href="#example" className="btn btn-secondary btn-lg bg-white">
                See an example
              </a>
            </div>
          </div>
          <figure>
            <div className="preppy-frame rotate-1 bg-white">
              <img src={EXAMPLE.spread} alt="A two-page spread from an example book" className="block w-full" />
            </div>
            <figcaption className="mt-4 text-center text-sm text-navy/70">
              From <span className="italic">{EXAMPLE.title}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* How it works */}
      <section className="rise-in mt-20 space-y-6">
        <h2 className="text-center font-display text-3xl font-medium">How it works</h2>
        <ol className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className={`${s.pipe} bg-white p-6 ring-1 ring-[color:var(--line)]`}>
              <span className={`mt-2 flex h-10 w-10 items-center justify-center rounded-full font-display text-lg text-white ${s.dot}`}>{s.n}</span>
              <h3 className="mt-4 font-display text-xl font-medium">{s.title}</h3>
              <p className="mt-2 text-[color:var(--muted)]">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-20">
        <ScrollBand src={EXAMPLE.bands.boats} alt="Children sailing leaf boats down a stream">
          <p className="font-display text-2xl italic sm:text-3xl">&ldquo;We can share,&rdquo; says Oliver, and he puts his big boat in her hands.</p>
        </ScrollBand>
      </div>

      {/* Example book */}
      <section id="example" className="mt-20 scroll-mt-24 space-y-8">
        <div className="rise-in text-center">
          <p className="eyebrow text-coral">An example book</p>
          <h2 className="font-display text-3xl font-medium italic">{EXAMPLE.title}</h2>
          <p className="mt-1 text-[color:var(--muted)]">
            {EXAMPLE.theme} theme · {EXAMPLE.style} style · starring a one-year-old and her big brothers
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3">
          {EXAMPLE.pages.map((p, i) => (
            <li key={p.src} className={`rise-in ${FRAMES[i % FRAMES.length]} shadow-md transition hover:-translate-y-1 hover:shadow-lg`}>
              <img src={p.src} alt={p.alt} loading="lazy" className="block aspect-square w-full object-cover" />
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-20">
        <ScrollBand src={EXAMPLE.bands.oak} alt="Woodland friends at the old oak" ribbon="candy" />
      </div>

      {/* Styles */}
      <section className="rise-in full-bleed mt-0 bg-cream">
        <div className="mx-auto max-w-6xl space-y-5 px-5 py-14 text-center sm:px-10">
          <h2 className="font-display text-3xl font-medium">Painted your way</h2>
          <p className="mx-auto max-w-xl text-[color:var(--muted)]">
            Choose a look for every book, from delicate hand-painted whimsy to bold, bright comics. Your child&apos;s character is drawn to match.
          </p>
          <ul className="flex flex-wrap justify-center gap-2">
            {STYLES.map((s, i) => (
              <li key={s} className={`bg-white px-4 py-1.5 text-sm ring-1 ring-[color:var(--line)] ${["pipe-pink", "pipe-tangerine", "pipe-sun", "pipe-mint", "pipe-blue", "pipe-lilac"][i % 6]}`}>
                {ART_STYLE_LABELS[s]}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ScrollBand src={EXAMPLE.bands.lantern} alt="Friends together on a log bench as the stars come out">
        <h2 className="font-display text-3xl font-medium !text-white sm:text-4xl">Make a book they&apos;ll keep forever</h2>
        <p className="mt-2 text-white/90">Every new account starts with free credits to write and paint your first story.</p>
        <Link href={startHref} className="btn btn-lg mt-5 inline-flex bg-coral text-white hover:bg-pink">
          {cta}
        </Link>
      </ScrollBand>
    </div>
  );
}
