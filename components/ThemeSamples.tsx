/* eslint-disable @next/next/no-img-element */

/** Sample pages for a theme card, fanned like pages of a book; a flat painted-shape placeholder in the theme's colors when there are none yet. */
export function ThemeSamples({ samples, palette, name, tall = false }: { samples?: string[]; palette: string[]; name: string; tall?: boolean }) {
  const h = tall ? "h-44" : "h-36";
  if (samples?.length) {
    return (
      <div className={`relative flex ${h} items-center justify-center gap-2 overflow-hidden bg-paper-sunk px-4`} aria-label={`Sample pages from ${name}`}>
        {samples.slice(0, 3).map((src, i, all) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            width={160} height={160} className={`aspect-square h-[82%] w-auto max-w-[45%] shrink-0 rounded-[var(--radius-book)] bg-paper-raised object-cover shadow-lift ring-1 ring-line ${all.length > 1 ? (i === 0 ? "-rotate-2" : i === 1 ? "rotate-1" : "rotate-3") : ""}`}
          />
        ))}
      </div>
    );
  }
  // The theme's own palette is its art direction (product art), so the shapes keep those colors.
  const [a, b, c] = [palette[0], palette[1] ?? palette[0], palette[2] ?? palette[0]];
  return (
    <div className={`relative ${h} overflow-hidden bg-paper-sunk`} aria-label={`${name} colors`}>
      <div className="absolute -left-6 bottom-0 h-24 w-40 rounded-[50%]" style={{ background: b, opacity: 0.75 }} />
      <div className="absolute -right-8 bottom-[-20px] h-28 w-48 rounded-[50%]" style={{ background: c, opacity: 0.7 }} />
      <div className="absolute right-8 top-5 h-10 w-10 rounded-full" style={{ background: a, opacity: 0.85 }} />
      <span className="absolute bottom-2 left-3 rounded-full bg-paper-raised px-2.5 py-0.5 text-[13px] text-ink-muted">Sample pages coming soon</span>
    </div>
  );
}
