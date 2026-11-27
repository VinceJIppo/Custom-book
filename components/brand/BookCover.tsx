import type { CSSProperties, ReactNode } from "react";
import { Star } from "./Star";

/**
 * Book covers are product art (BRAND.md section 4): they keep fixed colors in both
 * themes. Approved grounds: delft, navy, sage and persimmon, each with ballet piping
 * and the child's name in buttercup, ballet or cream.
 */
export const COVER_GROUNDS = {
  delft: { cover: "#2e4c9e", fg: "#fffdf8", name: "#f2c64b" },
  navy: { cover: "#1e2a4f", fg: "#fffdf8", name: "#f3c6cd" },
  sage: { cover: "#7fa07c", fg: "#16204a", name: "#16204a" },
  persimmon: { cover: "#c03f27", fg: "#fffdf8", name: "#fffdf8" },
} as const;
export type CoverGround = keyof typeof COVER_GROUNDS;

const SKY_STAR = { buttercup: "#f2c64b", cream: "#fffdf8", ballet: "#f3c6cd" } as const;
/** Stars in the top half of the cover only (from the reference). */
const SKY: Array<[x: number, y: number, size: number, rot: number, color: keyof typeof SKY_STAR]> = [
  [20, 64, 20, -12, "buttercup"],
  [89.1, 15.1, 13.8, 14, "cream"],
  [140, 38, 20, 22, "buttercup"],
  [198.5, 18.5, 15, -10, "cream"],
  [63.8, 77.8, 12.5, 8, "cream"],
  [179.9, 87.9, 16.2, -18, "ballet"],
  [116.4, 102.4, 11.2, 30, "cream"],
];
const DOTS: Array<[cx: number, cy: number, r: number, color: keyof typeof SKY_STAR]> = [
  [62, 52, 1.8, "buttercup"],
  [126, 30, 1.6, "cream"],
  [176, 72, 1.8, "cream"],
  [30, 110, 1.6, "buttercup"],
  [222, 64, 1.6, "buttercup"],
];

/** A cover mockup: "Starring" eyebrow, the child's name in script, the title in Young Serif. */
export function BookCover({
  name,
  title,
  ground = "delft",
  card = false,
  ribbon,
  className = "",
  style,
}: {
  name: string;
  title: string;
  ground?: CoverGround;
  /** Smaller type for book cards. */
  card?: boolean;
  ribbon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const g = COVER_GROUNDS[ground];
  return (
    <div
      className={`ss-cover${card ? " ss-cover--card" : ""} ${className}`}
      style={{ ["--cover" as string]: g.cover, ["--cover-fg" as string]: g.fg, ["--cover-name" as string]: g.name, ...style }}
      role="img"
      aria-label={`Book cover: ${title}, starring ${name}`}
    >
      <svg className="ss-cover__sky" viewBox="0 0 240 130" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
        {SKY.map(([x, y, size, rot, color], i) => (
          <use
            key={i}
            href="#ss-s"
            x={x}
            y={y}
            width={size}
            height={size}
            fill={SKY_STAR[color]}
            stroke={SKY_STAR[color]}
            strokeWidth={2.2}
            strokeLinejoin="round"
            transform={`rotate(${rot} ${x + size / 2} ${y + size / 2})`}
          />
        ))}
        {DOTS.map(([cx, cy, r, color], i) => (
          <circle key={i} cx={cx} cy={cy} r={r} fill={SKY_STAR[color]} />
        ))}
      </svg>
      {ribbon}
      <span className="ss-cover__starring" aria-hidden="true">
        Starring
      </span>
      <span className="ss-cover__name" aria-hidden="true">
        {name}
      </span>
      <span className="ss-cover__title" aria-hidden="true">
        {title}
      </span>
    </div>
  );
}

export function NewStoryRibbon() {
  return (
    <span className="ss-ribbon ss-ribbon--new">
      <Star />
      New story
    </span>
  );
}
