/* eslint-disable @next/next/no-img-element */

/** Sample pages for a theme card, fanned like pages of a book; a painted-paper placeholder when there are none yet. */
export function ThemeSamples({ samples, palette, name, tall = false }: { samples?: string[]; palette: string[]; name: string; tall?: boolean }) {
  const h = tall ? "h-44" : "h-36";
  if (samples?.length) {
    return (
      <div className={`relative flex ${h} items-center justify-center gap-2 overflow-hidden bg-cream px-4`} aria-label={`Sample pages from ${name}`}>
        {samples.slice(0, 3).map((src, i, all) => (
          <img
            key={src}
            src={src}
            alt=""
            loading="lazy"
            className={`h-[82%] w-auto max-w-[45%] rounded-md bg-white object-cover shadow-md ring-1 ring-black/5 ${all.length > 1 ? (i === 0 ? "-rotate-2" : i === 1 ? "rotate-1" : "rotate-3") : ""}`}
          />
        ))}
      </div>
    );
  }
  const [a, b, c, d] = [palette[0], palette[1] ?? palette[0], palette[2] ?? palette[0], palette[3] ?? "#ffffff"];
  return (
    <div className={`relative ${h} overflow-hidden`} style={{ background: `linear-gradient(160deg, ${d}, ${a}33)` }} aria-label={`${name} colors`}>
      <div className="absolute -left-6 bottom-0 h-24 w-40 rounded-[50%]" style={{ background: b, opacity: 0.75 }} />
      <div className="absolute -right-8 bottom-[-20px] h-28 w-48 rounded-[50%]" style={{ background: c, opacity: 0.7 }} />
      <div className="absolute right-8 top-5 h-10 w-10 rounded-full" style={{ background: a, opacity: 0.85 }} />
      <span className="absolute bottom-2 left-3 rounded-full bg-white/80 px-2 py-0.5 text-[11px] text-navy/70">Sample pages coming soon</span>
    </div>
  );
}
