"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PageFlip } from "page-flip";
import { BookPage, CoverBack, CoverFront, InsideCover } from "@/components/book/BookPage";
import type { BookView } from "@/lib/books/viewTypes";

/**
 * Animated flipbook. React renders every page once into a hidden "source"
 * container; the page-flip library gets clones of those nodes in a host element
 * React never touches, so the two never fight over the DOM. The book is rebuilt
 * only when its content changes (contentKey), not when image URLs rotate.
 */
const noopSubscribe = () => () => {};

export function Flipbook({ book }: { book: BookView }) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  // False on the server and during hydration, true in browsers with speech synthesis.
  const canSpeak = useSyncExternalStore(
    noopSubscribe,
    () => "speechSynthesis" in window,
    () => false,
  );

  // Text for read-aloud, indexed like the flipbook: front cover, inside cover, interior pages, inside cover, back cover.
  const texts = [
    `${book.title}. Starring ${book.childName}.`,
    "",
    ...book.pages.map((p) => (p.kind === "story" && p.half !== "right" ? p.text : p.kind === "belongsTo" ? `This book belongs to ${p.text}` : p.kind === "title" ? book.title : p.kind === "theEnd" ? "The End" : p.kind === "dedication" ? p.text : "")),
    "",
    book.backBlurb,
  ];

  useEffect(() => {
    const source = sourceRef.current;
    const host = hostRef.current;
    if (!source || !host) return;
    let cancelled = false;
    let flip: PageFlip | null = null;
    const startPage = flipRef.current?.getCurrentPageIndex() ?? 0;
    const mount = document.createElement("div");
    mount.className = "flip-host";
    host.appendChild(mount);

    import("page-flip").then(({ PageFlip }) => {
      if (cancelled) return;
      const nodes = Array.from(source.querySelectorAll<HTMLElement>(":scope > .flip-page")).map((n) => n.cloneNode(true) as HTMLElement);
      nodes.forEach((n) => mount.appendChild(n));
      const ratio = book.trim.heightIn / book.trim.widthIn;
      flip = new PageFlip(mount, {
        width: 500,
        height: Math.round(500 * ratio),
        size: "stretch",
        minWidth: 240,
        maxWidth: 900,
        minHeight: Math.round(240 * ratio),
        maxHeight: Math.round(900 * ratio),
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: true,
        maxShadowOpacity: 0.35,
        flippingTime: 700,
        startPage: Math.min(startPage, nodes.length - 1),
      });
      flip.loadFromHTML(nodes);
      flip.on("flip", (e) => setCurrent(Number(e.data)));
      flipRef.current = flip;
      setTotal(flip.getPageCount());
      setCurrent(flip.getCurrentPageIndex());
    });

    return () => {
      cancelled = true;
      try {
        flip?.destroy();
      } catch {
        /* already gone */
      }
      mount.remove();
      if (flipRef.current === flip) flipRef.current = null;
    };
    // Rebuild only when the visible content changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.contentKey]);

  const next = useCallback(() => flipRef.current?.flipNext(), []);
  const prev = useCallback(() => flipRef.current?.flipPrev(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const readAloud = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const portrait = flipRef.current?.getOrientation() === "portrait";
    const idx = [current, ...(portrait || current === 0 ? [] : [current + 1])];
    const text = idx.map((i) => texts[i] ?? "").filter(Boolean).join(" ");
    if (!text) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    synth.speak(u);
  };

  return (
    <div className="w-full">
      <div ref={stageRef} className="flip-stage mx-auto w-full max-w-5xl">
        <div ref={hostRef} className="mx-auto w-full" data-testid="flipbook" />
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-sm">
          <button onClick={prev} className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm ring-1 ring-black/10 hover:bg-violet-50" aria-label="Previous page">
            ◀ Back
          </button>
          <span className="min-w-28 text-center tabular-nums text-[color:var(--muted)]" data-testid="page-indicator">
            {total ? `${current + 1} / ${total}` : "Loading..."}
          </span>
          <button onClick={next} className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm ring-1 ring-black/10 hover:bg-violet-50" aria-label="Next page">
            Next ▶
          </button>
          {canSpeak && (
            <button onClick={readAloud} className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm ring-1 ring-black/10 hover:bg-violet-50">
              {speaking ? "■ Stop" : "🔊 Read aloud"}
            </button>
          )}
          <button onClick={fullscreen} className="rounded-full bg-white px-4 py-2 font-semibold shadow-sm ring-1 ring-black/10 hover:bg-violet-50">
            ⛶ Fullscreen
          </button>
        </div>
      </div>

      {/* Hidden source pages that page-flip clones. */}
      <div ref={sourceRef} className="flip-source" aria-hidden>
        <div className="flip-page" data-density="hard">
          <CoverFront book={book} mode="screen" />
        </div>
        <div className="flip-page">
          <InsideCover book={book} mode="screen" label="Inside front cover" />
        </div>
        {book.pages.map((p) => (
          <div className="flip-page" key={`${p.number}`}>
            <BookPage page={p} book={book} mode="screen" />
          </div>
        ))}
        <div className="flip-page">
          <InsideCover book={book} mode="screen" label="Inside back cover" />
        </div>
        <div className="flip-page" data-density="hard">
          <CoverBack book={book} mode="screen" />
        </div>
      </div>
    </div>
  );
}
