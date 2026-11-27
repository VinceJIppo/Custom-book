/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { loadBuiltInThemeFiles } from "@/lib/themes";
import { HOUSE_THEME_ID } from "@/lib/schemas/theme";
import { Star } from "@/components/brand/Star";
import {
  BookCover,
  NewStoryRibbon,
  type CoverGround,
} from "@/components/brand/BookCover";

/**
 * The home page for visitors, built to storystar-brand/BRAND.md section 10:
 * hero, how it works, stories, peek inside, gifts, questions. The header and footer
 * come from the layout. Bracketed text is a fact only the business can supply.
 */

/** Printed hardcover length for the story lengths we offer (12 to 24 story pages plus title,
 *  "belongs to", dedication and "The End" pages, padded to the printer's 24-page minimum). */
const PAGE_RANGE = "24 to 30 pages";

/** Sample names on cover mockups (placeholders, BRAND.md section 10). */
const SAMPLE_NAMES = ["Hazel", "Milo", "June", "Arlo", "Nell", "Otis"];
const GROUNDS: CoverGround[] = [
  "delft",
  "navy",
  "sage",
  "persimmon",
  "navy",
  "delft",
];

const STEPS = [
  {
    title: "Add a photo",
    text: "One clear, smiling face in good light. A phone photo is perfect.",
    rot: -10,
  },
  {
    title: "Pick a story",
    text: "A firefly who lost her glow, a sleepy sunflower clock, a lullaby for the whole garden.",
    rot: 8,
  },
  {
    title: "Write a dedication",
    text: "A few lines for the first page, signed however you like.",
    rot: -4,
  },
  {
    title: "Unwrap it together",
    text: "A hardcover book with your dedication on the first page.",
    rot: 12,
  },
];

const TRAIL: Array<
  [left: number, top: number, size: number, color: string, rot: number]
> = [
  [44, 64, 12, "var(--persimmon)", -10],
  [50, 58, 9, "var(--buttercup)", 18],
  [55, 52, 14, "var(--persimmon)", 6],
  [40, 72, 8, "var(--buttercup)", -20],
];

export function Landing({
  startHref,
}: {
  signedIn: boolean;
  startHref: string;
}) {
  const house = loadBuiltInThemeFiles().find((t) => t.id === HOUSE_THEME_ID);
  const stories = house?.starters ?? [];
  return (
    <div className="-mb-8 -mt-8 sm:-mb-12 sm:-mt-12">
      {/* 1. Hero */}
      <section className="full-bleed">
        <div className="ss-container ss-hero">
          <div className="ss-hero__copy">
            <p className="ss-eyebrow">Personalized picture books</p>
            <h1 className="ss-h1">every child, the star</h1>
            <p className="ss-lede">
              Upload one photo and your child becomes the hero of a hardcover
              storybook, the one they will ask for again tonight.
            </p>
            <div className="ss-hero__actions">
              <Link
                className="ss-btn ss-btn--primary"
                href={startHref}
                data-testid="landing-start"
              >
                <Star />
                Make their book
              </Link>
              <Link className="ss-link" href="/examples">
                See a sample page
              </Link>
            </div>
            <ul className="ss-facts">
              <li>
                <Star />
                Hardcover, {PAGE_RANGE}
              </li>
              <li>
                <Star />
                From [YOUR PRICE]
              </li>
              <li>
                <Star />
                Ships in [X] days
              </li>
            </ul>
          </div>
          <div className="ss-hero__art">
            <BookCover
              name="Hazel"
              title={stories[0]?.title ?? "Luma's Lost Glow"}
              ribbon={<NewStoryRibbon />}
            />
            <div className="ss-frame">
              <div className="ss-frame__photo">
                <div
                  className="ss-frame__placeholder"
                  role="img"
                  aria-label="Placeholder for your child's photo"
                >
                  <span>Your child&apos;s photo</span>
                </div>
              </div>
            </div>
            {TRAIL.map(([left, top, size, color, rot], i) => (
              <Star
                key={i}
                className="ss-trail"
                style={{
                  left: `${left}%`,
                  top: `${top}%`,
                  width: size,
                  height: size,
                  color,
                  transform: `rotate(${rot}deg)`,
                }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* 2. How it works */}
      <section className="full-bleed ss-band-raised scroll-mt-4" id="how">
        <div className="ss-container ss-section">
          <p className="ss-eyebrow">How it works</p>
          <h2 className="ss-h2 max-w-[640px]">
            From one photo to a book on their nightstand
          </h2>
          <ol className="ss-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="ss-step">
                <div className="ss-step__badge">
                  <Star style={{ transform: `rotate(${s.rot}deg)` }} />
                  <span>{i + 1}</span>
                </div>
                <h3 className="ss-h3">{s.title}</h3>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="ss-ticking" aria-hidden="true" />
      </section>

      {/* 3. Stories */}
      <section className="full-bleed scroll-mt-4" id="stories">
        <div className="ss-container ss-section">
          <div className="ss-section__head">
            <div>
              <p className="ss-eyebrow">The Wishing Garden</p>
              <h2 className="ss-h2">Pick where the story goes</h2>
            </div>
            <Link className="ss-link" href="/examples">
              Peek inside a book
            </Link>
          </div>
          <div className="ss-books">
            {stories.map((s, i) => (
              <article
                key={s.id}
                className="ss-book"
                data-testid={`landing-story-${s.id}`}
              >
                <BookCover
                  card
                  name={SAMPLE_NAMES[i % SAMPLE_NAMES.length]}
                  title={s.title}
                  ground={GROUNDS[i % GROUNDS.length]}
                  ribbon={i === 0 ? <NewStoryRibbon /> : undefined}
                />
                <div className="ss-book__meta">
                  <h3 className="ss-book__title">{s.title}</h3>
                  <span className="ss-book__price">[PRICE]</span>
                </div>
                <p className="ss-book__detail">
                  Hardcover, {PAGE_RANGE}. {s.summary}
                </p>
                <Link
                  className="ss-btn ss-btn--secondary ss-btn--sm"
                  href={startHref}
                >
                  Choose this story
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Peek inside */}
      <section className="full-bleed ss-band-sunk scroll-mt-4" id="peek">
        <div className="ss-container ss-section ss-peek">
          <div className="ss-peek__copy">
            <p className="ss-eyebrow">Peek inside</p>
            <h2 className="ss-h2 mb-4">
              Their name, their face, on every page
            </h2>
            <p className="ss-muted mb-7 mt-0">
              Illustrated from your photo, a story written to be read aloud, and
              a hero who looks a lot like the one on your lap.
            </p>
            <Link className="ss-btn ss-btn--secondary" href="/examples">
              Flip through a sample book
            </Link>
          </div>
          <figure
            className="ss-spread m-0"
            aria-label="A two-page spread from a sample book, Charlie and the Stream That Goes"
          >
            <img
              src="/examples/charlie/spread.jpg"
              alt="A two-page spread from a sample book: Charlie and her brothers by the stream"
              className="block h-auto w-full"
            />
          </figure>
        </div>
      </section>

      {/* 5. Gifts */}
      <section
        className="full-bleed ss-gift ss-scallop-hem scroll-mt-4"
        id="gifts"
      >
        <div className="ss-container ss-gift__inner">
          <div className="ss-gift__copy">
            <p className="ss-eyebrow">Made to be given</p>
            <h2 className="ss-h2 mb-4">A gift that starts with their name</h2>
            <p className="mb-7 mt-0">
              Write a dedication for the first page and it is printed in their
              hardcover. Gift orders can ship straight to the lucky reader with
              a gift note, for a birthday, a new sibling or the first night in a
              big-kid bed.
            </p>
            <Link className="ss-btn ss-btn--secondary" href={startHref}>
              Make one to give
            </Link>
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] justify-center">
            <div className="ss-dedication">
              <img
                className="ss-dedication__seal"
                src="/brand/logos/storystar-monogram.svg"
                alt=""
                width={76}
                height={76}
              />
              <span className="ss-ribbon">Gift ready</span>
              <p className="ss-dedication__to" aria-label="For Hazel">
                For Hazel,
              </p>
              <p className="ss-dedication__body">
                who asks for one more story every single night. This one is all
                yours.
              </p>
              <p
                className="ss-dedication__from"
                aria-label="With love, Grandma"
              >
                with love, Grandma
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 6. Questions */}
      <section className="full-bleed">
        <div className="ss-container ss-section">
          <h2 className="ss-h2">Questions grown-ups ask</h2>
          <div className="ss-faq">
            <div className="ss-faq__item">
              <h3>What kind of photo works best?</h3>
              <p>
                A clear, front-facing photo in good light with nothing covering
                the face. A phone photo is perfect.
              </p>
            </div>
            <div className="ss-faq__item">
              <h3>What happens to my child&apos;s photo?</h3>
              <p>
                We use it only to draw your child&apos;s character. Location
                data is removed, photos are stored encrypted, and by default the
                original photos are deleted as soon as you approve the
                character.{" "}
                <Link className="ss-link" href="/photo-privacy">
                  Read our photo privacy page
                </Link>
              </p>
            </div>
            <div className="ss-faq__item">
              <h3>When will it arrive?</h3>
              <p>
                [YOUR SHIPPING WINDOW]. Gift orders can ship straight to the
                lucky reader.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
