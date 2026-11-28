/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { getOptionalUser } from "@/lib/auth";
import { Star } from "@/components/brand/Star";

export const dynamic = "force-dynamic";
export const metadata = { title: "Our story | StoryStar", description: "Why StoryStar exists: more joy and love in reading for kids of all ages." };

const BELIEFS = [
  { title: "Every child gets to be the star", text: "A story means more when the hero has your child's name and face." },
  { title: "Reading should be a treat", text: "The best book is the one they ask for again tonight, not one more thing to get through before lights out." },
  { title: "Stories can build character", text: "Seeing themselves be brave, strong or kind in a story gives children a little practice for the real thing." },
];

/** Our story: why StoryStar exists, told as two young parents (no names, by the owner's wish). Every fact here comes from the owner. */
export default async function OurStoryPage() {
  const user = await getOptionalUser();
  const startHref = user ? "/books/new" : "/signin";
  return (
    <div className="space-y-16 sm:space-y-20">
      <header className="max-w-2xl">
        <p className="ss-eyebrow">Our story</p>
        <h1 className="ss-h1 !mb-4">it started with one more story</h1>
        <p className="ss-lede">StoryStar is here to bring more joy and love to reading, for the kids being read to and the grown-ups doing the voices.</p>
      </header>

      <section className="max-w-2xl space-y-4 text-[17px] leading-[28px]" aria-labelledby="started">
        <h2 id="started" className="ss-h2">
          The heroes were already tucked in
        </h2>
        <p>StoryStar started with two young parents who loved telling stories about their kids. At bedtime the hero was always someone in the room, usually the one who was supposed to be asleep.</p>
        <p>But a story told out loud never stays put. They wanted to see theirs written down, with their own kids right there in the pictures.</p>
        <p>That wish became StoryStar: hardcover picture books starring your child, illustrated from your photos, ready for one more story tomorrow night.</p>
      </section>

      <section className="grid items-center gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]" aria-labelledby="kindness">
        <div className="space-y-4 text-[17px] leading-[28px]">
          <h2 id="kindness" className="ss-h2">
            Who they are growing into
          </h2>
          <p>
            They had a second hope too. Every parent has qualities they want to see grow in their children: courage, strength, kindness, the grit to keep going when something is hard. Saying so for the hundredth time
            only gets you so far.
          </p>
          <p>
            A book that shows an older brother teaching his younger sister how to be brave, standing up for her or sharing with her, can be a powerful thing. Kids get to see themselves at their best, in whatever way
            matters most to your family. With any luck, they try it out the next day.
          </p>
        </div>
        {/* A sample page: printed-book paper, so it keeps its fixed colors in both themes. */}
        <figure className="m-0 -rotate-1 rounded-[var(--radius-book)] bg-white p-7 text-[#1e2a4f] shadow-book sm:p-8">
          <p className="m-0 font-display text-[19px] leading-[31px]">
            The hallway was very long and very dark. Lily held her blanket tight. So her big brother Sam gave her his flashlight, the good one with the green button. &ldquo;You go first,&rdquo; he whispered, &ldquo;and
            I&apos;ll be right behind you.&rdquo;
          </p>
          <figcaption className="mt-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#5b6385]">A sample page</figcaption>
        </figure>
      </section>

      <section className="full-bleed ss-band-sunk" aria-labelledby="believe">
        {/* Same width and side padding as the page's main column, so the text lines up with the sections above. */}
        <div className="ss-section mx-auto max-w-6xl px-5 sm:px-10">
          <h2 id="believe" className="ss-h2">
            What we believe
          </h2>
          <p className="ss-lede mt-3 max-w-2xl">Our mission is to bring more joy and love to reading for kids of all ages, starting with your star.</p>
          <ul className="m-0 mt-8 grid list-none gap-4 p-0 md:grid-cols-3">
            {BELIEFS.map((b) => (
              <li key={b.title} className="ss-card ss-card--piped">
                <Star className="!h-6 !w-6 text-buttercup" />
                <h3 className="ss-h3 mt-3">{b.title}</h3>
                <p className="m-0 text-ink-muted">{b.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col items-center gap-12 md:flex-row md:items-center md:justify-between" aria-label="A note from us">
        <div className="ss-dedication">
          <img className="ss-dedication__seal" src="/brand/logos/storystar-monogram.svg" alt="" width={76} height={76} />
          <p className="ss-dedication__body mt-4">
            We started StoryStar because we loved telling stories about our kids and wanted to hold on to them. We hope your book becomes the one someone in your house can recite with their eyes closed, and that it shows
            your star a little of who they can be. Thank you for letting us be part of story time.
          </p>
          <p className="ss-dedication__from">
            With love,
            <br />
            two young parents
          </p>
        </div>
        <div className="max-w-md space-y-5">
          <p className="ss-h3 !m-0">Your star is already the hero of most of your stories. Now they can star in a book.</p>
          <Link href={startHref} className="ss-btn ss-btn--primary">
            <Star />
            Make their book
          </Link>
        </div>
      </section>
    </div>
  );
}
