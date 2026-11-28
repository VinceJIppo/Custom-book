/** A long-form legal or help page (Shipping, Terms), rendered by components/LegalPage.tsx. */
export interface LegalSection {
  id: string;
  heading: string;
  /** Plain text; [words](/path) becomes a link. */
  paragraphs: string[];
  bullets: string[];
  table?: { columns: string[]; rows: string[][] };
  /** Smaller headings inside this section. */
  sub?: LegalSection[];
}

export interface LegalPage {
  title: string;
  description: string;
  lede: string;
  /** "The short version" list at the top. */
  short: string[];
  sections: LegalSection[];
  /** Bracketed facts still to fill in (kept visible on the page until they are). */
  placeholders: string[];
}
