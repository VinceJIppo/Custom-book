import type { CSSProperties, ReactNode } from "react";
import { BLEED_IN, IMAGE_TOP_FRACTION, SPOT_FRACTION, safeBox, type Box, type TrimSize } from "@/lib/print/geometry";
import type { BookView, PageView } from "@/lib/books/viewTypes";
import { VIGNETTE_STYLES } from "@/lib/schemas/theme";

/** "vignette": the quiet look (serif text, small pictures fading into a white page). */
export function lookFor(style: string) {
  return VIGNETTE_STYLES.has(style) ? "vignette" : "classic";
}

/**
 * One physical book page. All positions are in inches from the top-left of the
 * bleed box, expressed with the --in CSS unit, so the same markup renders at
 * any screen size (container query units) and at exact size for print.
 *
 * mode="screen": shows the trimmed page (bleed is clipped), scales to its container.
 * mode="print": renders the full bleed box at physical size.
 */
export type PageMode = "screen" | "print";

const inch = (n: number) => `calc(var(--in) * ${n.toFixed(4)})`;
const boxStyle = (b: Box): CSSProperties => ({ left: inch(b.x), top: inch(b.y), width: inch(b.width), height: inch(b.height) });

const FONT_SIZE_IN: Record<BookView["readingLevel"], number> = { "2-4": 0.34, "4-6": 0.27, "6-8": 0.22 };

export function PageFrame({ trim, mode, children, label, look = "classic" }: { trim: BookView["trim"]; mode: PageMode; children: ReactNode; label?: string; look?: string }) {
  const vars = { "--tw": trim.widthIn, "--th": trim.heightIn, "--b": BLEED_IN } as CSSProperties;
  return (
    <div className="bk-page" data-mode={mode} data-look={look} style={vars} aria-label={label}>
      <div className="bk-bleed">
        <div className="bk-content">{children}</div>
      </div>
    </div>
  );
}

function Art({ url, status, style, alt }: { url: string | null; status: string; style: CSSProperties; alt: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="bk-art" src={url} alt={alt} style={style} draggable={false} />;
  }
  return (
    <div className="bk-art bk-art-placeholder" data-status={status} style={style}>
      <span>{status === "failed" ? "This picture didn't work. Use Try again." : "Painting this page..."}</span>
    </div>
  );
}

function bleedSize(trim: TrimSize | BookView["trim"]) {
  return { w: trim.widthIn + 2 * BLEED_IN, h: trim.heightIn + 2 * BLEED_IN };
}

function TextBox({ text, zone, safe, book, panel = true, align = "left" }: { text: string; zone: PageView["textZone"]; safe: Box; book: BookView; panel?: boolean; align?: "left" | "center" }) {
  const fs = FONT_SIZE_IN[book.readingLevel];
  const half = { ...safe, width: safe.width * 0.62 };
  // Capped so text never buries the picture; preflight reports text that doesn't fit.
  const maxH = zone === "top" || zone === "bottom" ? safe.height * 0.5 : safe.height * 0.75;
  const style: CSSProperties = { fontSize: inch(fs), textAlign: align, maxHeight: inch(maxH), overflow: "hidden" };
  if (zone === "top") Object.assign(style, { left: inch(safe.x), top: inch(safe.y), width: inch(safe.width) });
  else if (zone === "bottom") Object.assign(style, { left: inch(safe.x), bottom: `calc(var(--in) * ${(bleedSize(book.trim).h - safe.y - safe.height).toFixed(4)})`, width: inch(safe.width) });
  else if (zone === "left") Object.assign(style, { left: inch(safe.x), top: inch(safe.y), width: inch(half.width) });
  else Object.assign(style, { left: inch(safe.x + safe.width - half.width), top: inch(safe.y), width: inch(half.width) });
  return (
    <div className={panel ? "bk-text bk-text-panel" : "bk-text"} style={style}>
      {text}
    </div>
  );
}

function Story({ page, book }: { page: PageView; book: BookView }) {
  const trim = book.trim as unknown as TrimSize;
  const safe = safeBox(trim, page.number);
  const { w, h } = bleedSize(book.trim);
  const alt = `Illustration for page ${page.storyNumber ?? page.number}`;

  if (page.layout === "spread") {
    const spreadW = 2 * book.trim.widthIn + 2 * BLEED_IN;
    const offset = page.half === "right" ? -book.trim.widthIn : 0;
    const showText = (page.textZone === "left" || page.textZone === "top" || page.textZone === "bottom") ? page.half === "left" : page.half === "right";
    return (
      <>
        <Art url={page.imageUrl} status={page.imageStatus} alt={alt} style={{ left: inch(offset), top: 0, width: inch(spreadW), height: inch(h) }} />
        {showText && <TextBox text={page.text} zone={page.textZone} safe={safe} book={book} />}
      </>
    );
  }

  if (lookFor(book.style) === "vignette") {
    // Words at the top, a small picture floating on the white page below (like a classic gentle picture book).
    const textH = safe.height * 0.3;
    const textBox: Box = { x: safe.x, y: safe.y, width: safe.width, height: textH };
    const artTop = safe.y + textH + 0.15;
    const artBox: Box = { x: safe.x, y: artTop, width: safe.width, height: safe.y + safe.height - artTop };
    return (
      <>
        <div className="bk-text bk-text-vignette" style={{ ...boxStyle(textBox), fontSize: inch(FONT_SIZE_IN[book.readingLevel] * 1.05) }}>
          {page.text}
        </div>
        <Art url={page.imageUrl} status={page.imageStatus} alt={alt} style={{ ...boxStyle(artBox), objectFit: "contain" }} />
      </>
    );
  }

  if (page.layout === "imageTop") {
    const imgH = h * IMAGE_TOP_FRACTION;
    const textTop = Math.max(imgH + 0.2, safe.y);
    const textBox: Box = { x: safe.x, y: textTop, width: safe.width, height: safe.y + safe.height - textTop };
    return (
      <>
        <Art url={page.imageUrl} status={page.imageStatus} alt={alt} style={{ left: 0, top: 0, width: inch(w), height: inch(imgH) }} />
        <div className="bk-text bk-text-center-v" style={{ ...boxStyle(textBox), fontSize: inch(FONT_SIZE_IN[book.readingLevel]) }}>
          {page.text}
        </div>
      </>
    );
  }

  if (page.layout === "textSpot") {
    const spot = book.trim.widthIn * SPOT_FRACTION;
    const spotBox: Box = { x: (w - spot) / 2, y: safe.y, width: spot, height: spot };
    const textTop = safe.y + spot + 0.25;
    const textBox: Box = { x: safe.x, y: textTop, width: safe.width, height: safe.y + safe.height - textTop };
    return (
      <>
        <div className="bk-tint" style={{ background: tint(book.palette[0], 0.1) }} />
        <Art url={page.imageUrl} status={page.imageStatus} alt={alt} style={{ ...boxStyle(spotBox), borderRadius: "50%" }} />
        <div className="bk-text bk-text-center-v" style={{ ...boxStyle(textBox), fontSize: inch(FONT_SIZE_IN[book.readingLevel]), textAlign: "center" }}>
          {page.text}
        </div>
      </>
    );
  }

  // fullBleed (default)
  return (
    <>
      <Art url={page.imageUrl} status={page.imageStatus} alt={alt} style={{ left: 0, top: 0, width: inch(w), height: inch(h) }} />
      <TextBox text={page.text} zone={page.textZone} safe={safe} book={book} />
    </>
  );
}

function FrontMatter({ page, book }: { page: PageView; book: BookView }) {
  const trim = book.trim as unknown as TrimSize;
  const safe = safeBox(trim, page.number);
  const [c1, c2, c3] = book.palette;
  switch (page.layout) {
    case "belongsTo":
      return (
        <>
          <div className="bk-tint" style={{ background: tint(c1, 0.12) }} />
          <div className="bk-frame" style={{ ...boxStyle(safe), borderColor: c1 }}>
            <div className="bk-display" style={{ fontSize: inch(0.42), color: c1 }}>This book belongs to</div>
            <div className="bk-name-line" style={{ fontSize: inch(0.55), borderColor: c2 ?? c1 }}>{page.text}</div>
            <Stars color={c3 ?? c1} />
          </div>
        </>
      );
    case "dedication":
      return (
        <div className="bk-center" style={boxStyle(safe)}>
          <div style={{ color: c1, fontSize: inch(0.5) }} aria-hidden>
            ✦
          </div>
          <p className="bk-dedication" style={{ fontSize: inch(0.27) }}>
            {page.text}
          </p>
        </div>
      );
    case "title":
      return (
        <>
          <div className="bk-tint" style={{ background: `linear-gradient(160deg, ${tint(c1, 0.18)}, ${tint(c2 ?? c1, 0.28)})` }} />
          <div className="bk-center" style={boxStyle(safe)}>
            <h1 className="bk-display" style={{ fontSize: inch(0.62), color: c1 }}>
              {book.title}
            </h1>
            <p style={{ fontSize: inch(0.26), marginTop: inch(0.3) }}>
              A {book.themeName} story starring <strong>{book.childName}</strong>
            </p>
            <Stars color={c3 ?? c1} />
          </div>
        </>
      );
    case "theEnd":
      return (
        <div className="bk-center" style={boxStyle(safe)}>
          <div className="bk-display" style={{ fontSize: inch(0.9), color: c1 }}>
            The End
          </div>
          <Stars color={c3 ?? c1} />
        </div>
      );
    case "drawYourOwn":
      return (
        <>
          <div className="bk-frame bk-frame-dashed" style={{ ...boxStyle(safe), borderColor: c1 }}>
            <div className="bk-display" style={{ fontSize: inch(0.36), color: c1 }}>
              Draw your favorite part of the story!
            </div>
          </div>
        </>
      );
    case "endpaper":
    default:
      return <div className="bk-endpaper" style={{ "--c1": c1, "--c2": c2 ?? c1, "--c3": tint(c1, 0.6) } as CSSProperties} />;
  }
}

function Stars({ color }: { color: string }) {
  return (
    <div className="bk-stars" style={{ color, fontSize: inch(0.32) }} aria-hidden>
      ★ ☆ ★
    </div>
  );
}

/** A solid (opaque) lighter shade: the color mixed with white. No transparency, so PDFs need no flattening. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(255 + (c - 255) * amount);
  const [r, g, b] = [mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)];
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function BookPage({ page, book, mode }: { page: PageView; book: BookView; mode: PageMode }) {
  return (
    <PageFrame trim={book.trim} mode={mode} label={`Page ${page.number}`} look={lookFor(book.style)}>
      {page.kind === "story" ? <Story page={page} book={book} /> : <FrontMatter page={page} book={book} />}
      {mode === "screen" && page.number > 0 && <span className="bk-folio">{page.number}</span>}
    </PageFrame>
  );
}

/** Front cover, for the flipbook. The print cover is a separate wraparound PDF (Phase 3). */
export function CoverFront({ book, mode }: { book: BookView; mode: PageMode }) {
  const { w, h } = bleedSize(book.trim);
  const safe = safeBox(book.trim as unknown as TrimSize, 1);
  return (
    <PageFrame trim={book.trim} mode={mode} label="Front cover" look={lookFor(book.style)}>
      <Art url={book.cover.imageUrl} status={book.cover.imageStatus} alt="Cover illustration" style={{ left: 0, top: 0, width: inch(w), height: inch(h) }} />
      <div className="bk-cover-title" style={{ left: inch(safe.x - 0.2), top: inch(safe.y), width: inch(safe.width + 0.4), color: book.palette[0] }}>
        <h1 className="bk-display" style={{ fontSize: inch(0.62) }}>
          {book.title}
        </h1>
        <p style={{ fontSize: inch(0.24) }}>starring {book.childName}</p>
      </div>
    </PageFrame>
  );
}

/** Inside of a hardcover (endsheet). Shown in the flipbook so page 1 lands on the right, as in the printed book. */
export function InsideCover({ book, mode, label }: { book: BookView; mode: PageMode; label: string }) {
  const [c1, c2] = book.palette;
  return (
    <PageFrame trim={book.trim} mode={mode} label={label}>
      <div className="bk-endpaper" style={{ "--c1": c1, "--c2": c2 ?? c1, "--c3": tint(c1, 0.6) } as CSSProperties} />
    </PageFrame>
  );
}

export function CoverBack({ book, mode }: { book: BookView; mode: PageMode }) {
  const safe = safeBox(book.trim as unknown as TrimSize, 2);
  const [c1, c2] = book.palette;
  return (
    <PageFrame trim={book.trim} mode={mode} label="Back cover">
      <div className="bk-tint" style={{ background: `linear-gradient(200deg, ${c1}, ${c2 ?? c1})` }} />
      <div className="bk-center bk-back" style={boxStyle(safe)}>
        <p style={{ fontSize: inch(0.27) }}>{book.backBlurb}</p>
        <p className="bk-display" style={{ fontSize: inch(0.22), marginTop: inch(0.4) }}>
          StoryStar
        </p>
      </div>
    </PageFrame>
  );
}
