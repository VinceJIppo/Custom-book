import type { CSSProperties } from "react";
import { lookFor } from "./BookPage";
import type { Box } from "@/lib/print/geometry";
import type { CoverLayout } from "@/lib/print/cover";
import type { BookView } from "@/lib/books/viewTypes";
import { tint, type PageMode } from "./BookPage";

const inch = (n: number) => `calc(var(--in) * ${n.toFixed(4)})`;
const box = (b: Box): CSSProperties => ({ left: inch(b.x), top: inch(b.y), width: inch(b.width), height: inch(b.height) });

/**
 * The printed cover: one landscape spread (back cover, spine, front cover)
 * sized from the print provider's cover dimensions. Art and colors run into the
 * wrap/bleed; text stays inside each panel's safe area.
 */
export function CoverSpread({ book, layout, mode }: { book: BookView; layout: CoverLayout; mode: PageMode }) {
  const [c1, c2] = book.palette;
  const vars = { "--cw": layout.widthIn, "--ch": layout.heightIn } as CSSProperties;
  const frontArt: Box = { x: layout.front.x, y: 0, width: layout.widthIn - layout.front.x, height: layout.heightIn };
  const backFill: Box = { x: 0, y: 0, width: layout.spine.x, height: layout.heightIn };
  const spineFill: Box = { x: layout.spine.x, y: 0, width: layout.spineIn, height: layout.heightIn };

  return (
    <div className="bk-cover-spread" data-mode={mode} data-look={lookFor(book.style)} style={vars} aria-label="Book cover">
      <div className="bk-cover-inner">
        <div style={{ ...box(backFill), background: `linear-gradient(200deg, ${c1}, ${c2 ?? c1})` }} />
        <div style={{ ...box(spineFill), background: c1 }} />
        {book.cover.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="bk-art" src={book.cover.imageUrl} alt="Cover illustration" style={{ ...box(frontArt), objectFit: "cover" }} />
        ) : (
          <div className="bk-art-placeholder" style={box(frontArt)} />
        )}

        <div className="bk-cover-title" style={{ ...box({ ...layout.frontSafe, height: layout.frontSafe.height * 0.42 }), color: c1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <h1 className="bk-display" style={{ fontSize: inch(Math.min(0.62, layout.frontSafe.width / 12)) }}>
            {book.title}
          </h1>
          <p style={{ fontSize: inch(0.24) }}>starring {book.childName}</p>
        </div>

        <div className="bk-back" style={{ ...box(layout.backSafe), display: "flex", flexDirection: "column", justifyContent: "center", textAlign: "center" }}>
          <p style={{ fontSize: inch(0.27) }}>{book.backBlurb}</p>
          <p className="bk-display" style={{ fontSize: inch(0.22), marginTop: inch(0.4), color: tint(c2 ?? c1, 0.25) }}>
            StoryStar
          </p>
        </div>

        {layout.spineText && (
          <div className="bk-spine-text" style={{ ...box(layout.spineText), color: "#ffffff", fontSize: inch(Math.min(0.22, layout.spineText.width * 0.7)) }}>
            {book.title}
          </div>
        )}
      </div>
    </div>
  );
}
