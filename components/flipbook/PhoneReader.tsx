"use client";

import { fitTextIn } from "@/lib/print/fitText";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { BookPage, CoverBack, CoverFront } from "@/components/book/BookPage";
import type { BookView, PageView } from "@/lib/books/viewTypes";

const noopSubscribe = () => () => {};

/** One swipe = one slide: the cover, a single page, or a two-page picture spread kept together. */
type Slide = { key: string; kind: "front" } | { key: string; kind: "back" } | { key: string; kind: "pages"; pages: PageView[] };

function slidesFor(book: BookView): Slide[] {
  const out: Slide[] = [{ key: "front", kind: "front" }];
  const pages = book.pages;
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    // A picture that runs across two pages stays whole.
    if (p.half === "left" && pages[i + 1]?.half === "right") {
      out.push({ key: `p${p.number}`, kind: "pages", pages: [p, pages[i + 1]] });
      i++;
    } else {
      out.push({ key: `p${p.number}`, kind: "pages", pages: [p] });
    }
  }
  out.push({ key: "back", kind: "back" });
  return out;
}

function textOf(book: BookView, s: Slide) {
  if (s.kind === "front") return `${book.title}. Starring ${book.childName}.`;
  if (s.kind === "back") return book.backBlurb;
  return s.pages
    .map((p) => (p.kind === "story" && p.half !== "right" ? p.text : p.kind === "belongsTo" ? `This book belongs to ${p.text}` : p.kind === "title" ? book.title : p.kind === "theEnd" ? "The End" : p.kind === "dedication" ? p.text : ""))
    .filter(Boolean)
    .join(" ");
}

/**
 * Phone reader: pages fill the screen width and you swipe (or tap Back/Next)
 * between them. Spreads show as one wide picture. Uses the same page
 * components and text fitting as the print files, so it matches the printed book.
 */
export function PhoneReader({ book }: { book: BookView }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );
  const slides = slidesFor(book);

  // Same text fitting as the print files, once fonts are in.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    let cancelled = false;
    const fit = () => !cancelled && fitTextIn(el);
    (document.fonts?.ready ?? Promise.resolve()).then(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelled = true;
      window.removeEventListener("resize", fit);
    };
  }, [book.contentKey]);

  // Which slide is showing, from the scroll position.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const onScroll = () => setCurrent(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const go = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const n = Math.min(Math.max(i, 0), el.children.length - 1);
    el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }, []);

  const readAloud = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const text = textOf(book, slides[current]);
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <div className="-mx-4 sm:mx-0" data-testid="phone-reader">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollBehavior: "smooth" }}
      >
        {slides.map((s) => (
          <div key={s.key} className="flex w-full shrink-0 snap-center items-center justify-center px-4 py-2">
            <div className={`w-full overflow-hidden rounded-sm shadow-[0_6px_24px_rgba(30,20,60,0.18)] ring-1 ring-black/5 ${s.kind === "pages" && s.pages.length === 2 ? "flex" : ""}`}>
              {s.kind === "front" && <CoverFront book={book} mode="screen" />}
              {s.kind === "back" && <CoverBack book={book} mode="screen" />}
              {s.kind === "pages" &&
                s.pages.map((p) => (
                  <div key={p.number} className={s.pages.length === 2 ? "w-1/2" : "w-full"}>
                    <BookPage page={p} book={book} mode="screen" />
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-center gap-2 px-4 text-sm">
        <button onClick={() => go(current - 1)} disabled={current === 0} className="btn btn-secondary btn-sm" aria-label="Previous page">
          ◀
        </button>
        <span className="min-w-20 text-center tabular-nums text-[color:var(--muted)]" data-testid="page-indicator">
          {current + 1} / {slides.length}
        </span>
        <button onClick={() => go(current + 1)} disabled={current >= slides.length - 1} className="btn btn-secondary btn-sm" aria-label="Next page">
          ▶
        </button>
        {canSpeak && (
          <button onClick={readAloud} className="btn btn-secondary btn-sm">
            {speaking ? "■ Stop" : "🔊 Read"}
          </button>
        )}
      </div>
      <p className="mt-2 text-center text-xs text-[color:var(--muted)]">Swipe to turn the page.</p>
    </div>
  );
}
