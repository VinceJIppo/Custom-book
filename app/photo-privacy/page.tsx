import Link from "next/link";
import type { ReactNode } from "react";
import { Star } from "@/components/brand/Star";

export const metadata = { title: "Photo privacy | StoryStar" };

/**
 * What happens to the photos parents upload. Every statement here was checked against
 * the app's code and against Google's and Anthropic's own published terms (November
 * 2026). Bracketed text is a fact only the business can supply. Update this page if the
 * providers, their settings or the code change.
 */

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <h2 className="title">{title}</h2>
      {children}
    </section>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ss-link" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const SHORT = [
  "We ask for 1 to 3 photos only to draw your child's illustrated character. The book's pages are drawn from that character, never from the photos.",
  "Location and other hidden data are removed from every photo before it is checked or stored.",
  "Two services see the photos: Anthropic's Claude checks each one for a clear face, and Google's Gemini API draws the character. Under the business terms we use, neither may use them to train its models or improve its products.",
  "Photos are kept in private storage that only your account can reach, encrypted at rest.",
  "By default, the original photos are deleted as soon as you approve a character. You can delete photos, characters or everything about a child at any time.",
  "We never use your photos or your books for marketing, examples or training.",
];

/** The photo privacy page, linked from the footer and the homepage questions. */
export default function PhotoPrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-10 text-[17px] leading-[26px]">
      <header className="space-y-3">
        <p className="eyebrow">Photo privacy</p>
        <h1 className="display-l">What happens to your child&apos;s photos</h1>
        <p className="text-ink-muted">Last updated November 27, 2026. This page explains, step by step, where the photos you upload go, who can see them and how to delete them.</p>
      </header>

      <section className="ss-card ss-card--piped space-y-3" aria-labelledby="short-version">
        <h2 id="short-version" className="title">
          The short version
        </h2>
        <ul className="m-0 list-none space-y-2 p-0">
          {SHORT.map((s) => (
            <li key={s} className="flex gap-3">
              <Star className="mt-1.5 !h-3 !w-3 text-persimmon" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <Section id="why" title="What we ask for, and why">
        <p>
          To make your child the star of their book, we draw an illustrated character that looks like them. For that we ask for 1 to 3 photos of your child (or of a grown-up you add to the story). You confirm that you are the
          child&apos;s parent or legal guardian, or that you have permission to upload the photos, and every account holder confirms they are 18 or older.
        </p>
      </Section>

      <Section id="upload" title="When you upload a photo">
        <ul className="list-disc space-y-2 pl-6">
          <li>Your browser turns the photo upright, applies any crop you choose and shrinks it before it leaves your device.</li>
          <li>Our server accepts only JPG, PNG and HEIC photos, removes all hidden data (including GPS location), and saves a fresh copy no larger than 2048 pixels. The original file name is not kept.</li>
          <li>
            The photo is then sent to Anthropic&apos;s Claude, which checks that one face is clearly visible and, if there are several people, where the main face is so you can crop to it. Claude is instructed never to identify
            anyone.
          </li>
          <li>A photo that fails the check is not stored by us. It has already been sent to Anthropic for the check, as described below.</li>
        </ul>
      </Section>

      <Section id="drawing" title="Drawing the character with Google">
        <p>
          Once a photo is accepted, we send your stored photos to Google&apos;s Gemini API to draw three character options for you to choose from. This is the only time the photos themselves are sent to Google, and the only time
          they are used for drawing. Every page and the cover are drawn from the character you approved, never from the photos.
        </p>
        <p>
          We use the paid Gemini API. Google&apos;s{" "}
          <Ext href="https://ai.google.dev/gemini-api/terms">Gemini API Additional Terms of Service</Ext> (effective March 23, 2026) say that for paid services Google &ldquo;doesn&apos;t use your prompts (including &hellip; files such as
          images &hellip;) or responses to improve our products&rdquo;, and processes them as a data processor under its Data Processing Addendum.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>We ask Google not to store these drawing requests for later use (the &ldquo;store: false&rdquo; setting).</li>
          <li>
            Google still keeps API requests and responses for a limited time to detect misuse and for legal reasons. Its <Ext href="https://ai.google.dev/gemini-api/docs/usage-policies">abuse monitoring policy</Ext> gives 55
            days. If Google&apos;s safety systems flag something, authorized Google staff may review it.
          </li>
          <li>Pictures drawn by Gemini carry an invisible SynthID watermark that identifies them as made with Google&apos;s AI.</li>
          <li>If you choose to have pictures drawn overnight, the page requests go through Google&apos;s Batch Mode. Those requests carry the approved character and the story text, not your photos.</li>
        </ul>
      </Section>

      <Section id="anthropic" title="The photo check with Anthropic">
        <p>
          Anthropic&apos;s <Ext href="https://www.anthropic.com/legal/commercial-terms">Commercial Terms</Ext> say Anthropic may not train models on what its business customers send, and its{" "}
          <Ext href="https://platform.claude.com/docs/en/build-with-claude/vision">vision documentation</Ext> says uploaded images are not used to train models.
        </p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Anthropic keeps API data only for a limited period under its <Ext href="https://platform.claude.com/docs/en/manage-claude/api-and-data-retention">data retention policy</Ext>. Content its automated safety systems flag can
            be kept for up to 2 years, and data can be kept longer where the law requires it.
          </li>
          <li>Anthropic checks every image it receives against a database of known child sexual abuse material and reports matches as the law requires.</li>
          <li>Claude also looks at your approved character (not the photos) to note details like hair and glasses, and checks each drawn page against it.</li>
        </ul>
      </Section>

      <Section id="storage" title="Where photos are kept, and who can see them">
        <ul className="list-disc space-y-2 pl-6">
          <li>Photos and character pictures are kept in private cloud storage (Cloudflare R2), encrypted at rest by the storage provider. Nothing is public.</li>
          <li>Your photos are shown only to your signed-in account, through links that stop working after about five minutes.</li>
          <li>Our team has no screen for viewing customers&apos; photos, and our logs never contain image data.</li>
          <li>We never use your photos, characters or books for marketing, for the examples on this site, or to train anything.</li>
        </ul>
      </Section>

      <Section id="deleting" title="How long we keep them, and deleting">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="font-semibold">Original photos:</strong> by default they are deleted as soon as you approve a character. You can turn this off on the character page, and remove any photo with its &times; button.
          </li>
          <li>
            <strong className="font-semibold">Characters:</strong> you can delete a character at any time; its pictures are erased straight away. If you approve a new character to replace one, the old one&apos;s pictures stay in
            storage, hidden, until you use &ldquo;Delete everything&rdquo;.
          </li>
          <li>
            <strong className="font-semibold">Delete everything:</strong> on each child&apos;s or grown-up&apos;s page, this erases all their photos, characters, books, pages and print files. Records of paid orders (title,
            address, status) are kept for our accounts. Pictures of a grown-up already drawn into a child&apos;s book stay with that book.
          </li>
          <li>
            <strong className="font-semibold">Your account:</strong> to delete your whole account, email us at [CONTACT EMAIL].
          </li>
          <li>
            <strong className="font-semibold">Backups:</strong> our database backups may keep deleted records for [BACKUP RETENTION] before they roll off. Photo files themselves are not in those backups.
          </li>
        </ul>
      </Section>

      <Section id="others" title="Other services">
        <ul className="list-disc space-y-2 pl-6">
          <li>Our printer, Lulu, receives only the finished book files (the drawn pages and the words) and the shipping details, never photos.</li>
          <li>Stripe handles payment on its own page. It receives the order amount, the book title, the recipient&apos;s name and your email, never photos.</li>
          <li>Our email provider, Resend, sends sign-in links and notices about your books and orders, never images.</li>
        </ul>
      </Section>

      <Section id="questions" title="Questions">
        <p>
          Write to us at [CONTACT EMAIL] with any question about your photos, or to ask us to delete something. You can also read Google&apos;s <Ext href="https://policies.google.com/privacy">Privacy Policy</Ext> and
          Anthropic&apos;s <Ext href="https://www.anthropic.com/legal/privacy">Privacy Policy</Ext>.
        </p>
        <p>
          <Link className="ss-link" href="/">
            Back to StoryStar
          </Link>
        </p>
      </Section>
    </article>
  );
}
