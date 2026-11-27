import { Star } from "./Star";

/** Positions from storystar-brand/reference/homepage.html: 16 stars and 15 dots across the ceiling. */
const STARS: Array<[cls: "st-butter" | "st-cream" | "st-ballet", left: number, top: number, size: number, rot: number]> = [
  ["st-butter", 2, 22, 22, -12],
  ["st-cream", 9, 58, 13, 14],
  ["st-cream", 15, 16, 15, -20],
  ["st-butter", 21, 50, 24, 18],
  ["st-ballet", 28, 24, 12, -8],
  ["st-cream", 34, 62, 16, 22],
  ["st-butter", 41, 18, 21, -6],
  ["st-cream", 47, 56, 12, 30],
  ["st-cream", 54, 26, 15, -16],
  ["st-butter", 60, 54, 22, 10],
  ["st-ballet", 67, 16, 13, 24],
  ["st-cream", 73, 60, 15, -10],
  ["st-butter", 79, 22, 23, 16],
  ["st-cream", 86, 54, 12, -24],
  ["st-cream", 92, 20, 16, 8],
  ["st-butter", 97, 56, 20, -14],
];
const DOTS: Array<[cls: "ss-dot--butter" | "ss-dot--cream", left: number, top: number, size: number]> = [
  ["ss-dot--butter", 5, 40, 4],
  ["ss-dot--cream", 12, 30, 3],
  ["ss-dot--butter", 18, 72, 3],
  ["ss-dot--cream", 25, 40, 3],
  ["ss-dot--butter", 31, 80, 4],
  ["ss-dot--cream", 38, 44, 3],
  ["ss-dot--butter", 44, 76, 3],
  ["ss-dot--cream", 51, 44, 4],
  ["ss-dot--cream", 57, 80, 3],
  ["ss-dot--butter", 64, 42, 3],
  ["ss-dot--cream", 70, 82, 3],
  ["ss-dot--cream", 76, 44, 4],
  ["ss-dot--butter", 83, 80, 3],
  ["ss-dot--cream", 89, 44, 3],
  ["ss-dot--butter", 95, 80, 3],
];

/** The star ceiling under the header bar (decorative). On phones the band is 72px, so the lowest row is pulled up. */
export function StarBand() {
  return (
    <div className="ss-starband" aria-hidden="true">
      {STARS.map(([cls, left, top, size, rot], i) => (
        <Star key={`s${i}`} className={cls} style={{ left: `${left}%`, top: `calc(${top}px * var(--band-scale, 1))`, width: size, height: size, transform: `rotate(${rot}deg)` }} />
      ))}
      {DOTS.map(([cls, left, top, size], i) => (
        <span key={`d${i}`} className={`ss-dot ${cls}`} style={{ left: `${left}%`, top: `calc(${top}px * var(--band-scale, 1))`, width: size, height: size }} />
      ))}
    </div>
  );
}
