/** Serializable view model shared by the flipbook (client) and print pages (server). */
import type { Layout, TextZone } from "../schemas/story";

export interface PageView {
  number: number;
  side: "recto" | "verso";
  layout: Layout;
  half?: "left" | "right";
  degradedFrom?: Layout;
  pageId: string | null;
  kind: string;
  text: string;
  textZone: TextZone;
  imageUrl: string | null;
  imageStatus: string;
  storyNumber: number | null;
}

export interface BookView {
  id: string;
  title: string;
  childName: string;
  /** "Oliver and Mama": the hero plus the other real people in the book. */
  starring: string;
  themeName: string;
  /** Story voice label, e.g. "Rhyming and mischievous". */
  voiceLabel: string;
  style: string;
  status: string;
  trim: { id: string; widthIn: number; heightIn: number };
  palette: string[];
  readingLevel: "2-4" | "4-6" | "6-8";
  /** fit "below-title": the picture sits under the title band (newer covers); "full": the title is over the picture. */
  cover: { imageUrl: string | null; imageStatus: string; fit?: "below-title" | "full" };
  backBlurb: string;
  pages: PageView[];
  warnings: string[];
  /** Changes only when visible content changes (not when signed URLs rotate). */
  contentKey: string;
}
