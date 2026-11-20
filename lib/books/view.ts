import type { Book, Page } from "@prisma/client";
import { getStorage } from "../storage";
import { getPrintRouter } from "../providers/registry";
import { paginate } from "./paginate";
import { getTrim } from "../print/geometry";
import { storyContextFor } from "./context";
import type { Layout, TextZone } from "../schemas/story";
import type { BookView, PageView } from "./viewTypes";
import type { PageCountRules } from "../print/padding";

export interface BookViewOptions {
  /** Page-count rules of the product being printed (defaults to the hardcover for this size). */
  pageRules?: PageCountRules;
  /** How image keys become URLs (defaults to short-lived signed URLs). */
  resolveUrl?: (key: string) => string | Promise<string>;
}

/** Builds the flipbook / print view: paginated, padded, with short-lived image URLs. */
export async function buildBookView(book: Book & { pages: Page[] }, opts: BookViewOptions = {}): Promise<BookView> {
  const ctx = storyContextFor(book);
  const trim = getTrim(book.trimSize);
  const storage = getStorage();
  const pageRules = opts.pageRules ?? (await getPrintRouter().defaultProduct(book.trimSize)).pageRules;
  const pages = [...book.pages].sort((a, b) => a.index - b.index);
  const { pages: physical, warnings } = paginate(
    pages.map((p) => ({ id: p.id, kind: p.kind, layout: p.layout as Layout })),
    pageRules,
  );
  const byId = new Map(pages.map((p) => [p.id, p]));
  const urlCache = new Map<string, string>();
  const urlFor = async (key: string | null) => {
    if (!key) return null;
    if (!urlCache.has(key)) urlCache.set(key, opts.resolveUrl ? await opts.resolveUrl(key) : await storage.signedUrl(key));
    return urlCache.get(key)!;
  };

  const views: PageView[] = [];
  for (const pp of physical) {
    const p = pp.pageId ? byId.get(pp.pageId) : undefined;
    views.push({
      number: pp.number,
      side: pp.side,
      layout: pp.layout,
      half: pp.half,
      degradedFrom: pp.degradedFrom,
      pageId: pp.pageId,
      kind: p?.kind ?? pp.layout,
      text: p?.text ?? "",
      textZone: (p?.textZone as TextZone) ?? "bottom",
      imageUrl: await urlFor(p?.imageKey ?? null),
      imageStatus: p?.imageStatus ?? "none",
      storyNumber: p?.storyNumber ?? null,
    });
  }

  const childName = ctx.child.nickname || ctx.child.firstName;
  const contentKey = [book.id, book.version, book.title, book.coverImageKey, ...pages.map((p) => `${p.id}:${p.version}:${p.imageStatus}:${p.imageKey ?? ""}:${p.text.length}`)].join("|");
  return {
    id: book.id,
    title: book.title ?? "Your story",
    childName,
    themeName: ctx.theme.name,
    style: book.style,
    status: book.status,
    trim: { id: trim.id, widthIn: trim.widthIn, heightIn: trim.heightIn },
    palette: ctx.theme.artDirection.palette,
    readingLevel: ctx.options.readingLevel,
    cover: { imageUrl: await urlFor(book.coverImageKey), imageStatus: book.coverImageKey ? "ready" : "pending" },
    backBlurb: book.backBlurb ?? "",
    pages: views,
    warnings,
    contentKey: hash(contentKey),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
