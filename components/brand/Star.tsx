import type { CSSProperties } from "react";

/** The one hand-printed star path. Put <StarSymbol /> once in the root layout; draw it anywhere with <Star />. */
export function StarSymbol() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <symbol id="ss-s" viewBox="-12.5 -12.5 25 25">
        <path d="M0.06,-10.12 L3.19,-4.30 L9.77,-3.06 L4.71,1.53 L6.11,8.47 L0.05,5.41 L-5.81,8.10 L-4.97,1.60 L-9.07,-2.88 L-2.95,-4.15Z" />
      </symbol>
    </svg>
  );
}

/** A decorative star (always aria-hidden). Color comes from `color` / currentColor. */
export function Star({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg className={`ss-star ${className}`} viewBox="0 0 25 25" aria-hidden="true" focusable="false" style={style}>
      <use href="#ss-s" width="25" height="25" />
    </svg>
  );
}
