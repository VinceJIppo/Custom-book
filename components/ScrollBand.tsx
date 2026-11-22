/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";

/**
 * A picture across the full width of the window, with colorful ribbon borders.
 * The picture drifts gently as you scroll past (where the browser supports it).
 */
export function ScrollBand({ src, alt, children, ribbon = "rainbow" }: { src: string; alt: string; children?: ReactNode; ribbon?: "rainbow" | "candy" }) {
  const edge = ribbon === "candy" ? "ribbon-candy" : "ribbon-rainbow";
  return (
    <section className="full-bleed" aria-label={alt}>
      <div className={edge} />
      <div className="scroll-band">
        <img src={src} alt={alt} loading="lazy" />
        {children && (
          <div className="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-navy/80 via-navy/30 to-transparent p-6 sm:p-10">
            <div className="max-w-2xl text-center text-white [text-shadow:0_1px_12px_rgba(10,25,40,0.55)]">{children}</div>
          </div>
        )}
      </div>
      <div className={edge} />
    </section>
  );
}
