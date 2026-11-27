"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CreditBadge } from "@/components/CreditBadge";
import { THEME_KEY } from "./theme";
import { StarBand } from "./StarBand";

export interface NavLink {
  href: string;
  label: string;
}

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
}
const readTheme = () => (document.documentElement.getAttribute("data-theme") === "bedtime" ? "bedtime" : "daytime");

/** The moon button (a sun in Bedtime). Flips the theme and remembers the choice. */
function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "daytime");
  const next = theme === "bedtime" ? "daytime" : "bedtime";
  return (
    <button
      type="button"
      className="ss-iconbtn ss-theme-toggle"
      aria-label={theme === "bedtime" ? "Switch to daytime theme" : "Switch to bedtime theme"}
      data-testid="theme-toggle"
      onClick={() => {
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* private mode: the choice just isn't remembered */
        }
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ss-icon-moon">
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
      </svg>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true" className="ss-icon-sun">
        <circle cx="12" cy="12" r="4.5" />
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
      </svg>
    </button>
  );
}

/**
 * The site header (BRAND.md sections 9 and 10): ceiling bar with the cream wordmark,
 * nav, theme toggle and (for visitors) one small "Start a book" button; then the star
 * band and a scallop hem. On phones the nav opens as a panel from the menu button.
 */
export function SiteHeader({
  links,
  credits,
  signOut,
  signInHref,
  email,
  showCta,
}: {
  links: NavLink[];
  credits: number | null;
  /** Server action that signs out (email sign-in only). */
  signOut?: () => Promise<void>;
  signInHref?: string;
  email?: string;
  showCta: boolean;
}) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  // Close the phone menu after navigating.
  const [lastPath, setLastPath] = useState(path);
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className={`ss-header ss-scallop-hem${open ? " is-open" : ""}`} id="top">
      <div className="ss-container ss-header__bar">
        <Link className="ss-header__logo" href="/" aria-label="StoryStar home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logos/storystar-wordmark-cream.svg" alt="storystar" width={158} height={42} />
        </Link>
        <nav className="ss-nav" id="main-nav" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href + l.label} className="ss-wavy" href={l.href} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          {credits !== null && <CreditBadge initial={credits} />}
          {signInHref && (
            <Link className="ss-wavy" href={signInHref}>
              Sign in
            </Link>
          )}
          {signOut && (
            <form action={signOut} className="contents">
              {email && (
                <span className="ss-visually-hidden" data-testid="signed-in-as">
                  {email}
                </span>
              )}
              <button className="ss-wavy cursor-pointer text-left font-semibold" data-testid="sign-out" title={email ? `Signed in as ${email}` : undefined}>
                Sign out
              </button>
            </form>
          )}
        </nav>
        <ThemeToggle />
        <button
          type="button"
          className="ss-iconbtn ss-iconbtn--bare ss-menu-btn"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h10" />}
          </svg>
        </button>
        {showCta && (
          <Link className="ss-btn ss-btn--primary ss-btn--sm ss-header__cta" href="/books/new">
            Start a book
          </Link>
        )}
      </div>
      <StarBand />
    </header>
  );
}
