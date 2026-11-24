"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A box in fractions (0 to 1) of the image's width and height. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Longest side of the photo we send. Plenty for drawing a character, and keeps uploads small. */
export const MAX_SIDE = 2400;
const MIN = 0.08;

/** Opens a photo the browser can decode, upright (phone rotation applied). Null for formats it can't read (often HEIC). */
export async function openPhoto(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

/** Cuts the box out of the photo and returns a JPEG no bigger than MAX_SIDE. */
export async function cropToJpeg(bitmap: ImageBitmap, box: Box, name: string): Promise<File> {
  const sx = Math.round(box.left * bitmap.width);
  const sy = Math.round(box.top * bitmap.height);
  const sw = Math.max(1, Math.round(box.width * bitmap.width));
  const sh = Math.max(1, Math.round(box.height * bitmap.height));
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext("2d")!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not make the photo"))), "image/jpeg", 0.92));
  return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

/** Head and shoulders around a face box, kept inside the photo. */
export function headAndShoulders(face: Box, aspect: number): Box {
  // Work in pixels-ish units so the crop is roughly square on screen.
  const cx = face.left + face.width / 2;
  const cy = face.top + face.height / 2 + face.height * 0.35;
  const sizeY = Math.min(1, face.height * 2.8);
  const sizeX = Math.min(1, (sizeY / aspect) * 1);
  const left = Math.min(Math.max(cx - sizeX / 2, 0), 1 - sizeX);
  const top = Math.min(Math.max(cy - sizeY / 2, 0), 1 - sizeY);
  return { left, top, width: sizeX, height: sizeY };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

type Drag = { mode: "move" | "nw" | "ne" | "sw" | "se"; x: number; y: number; start: Box } | null;

/**
 * Shows the photo with a box the parent can drag and resize.
 * onDone gets the chosen box (or null for "use the whole photo").
 */
export function PhotoCropper({
  bitmap,
  initial,
  title,
  hint,
  onDone,
  onCancel,
}: {
  bitmap: ImageBitmap;
  initial: Box | null;
  title: string;
  hint: string;
  onDone: (box: Box | null) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>(initial ?? { left: 0.1, top: 0.1, width: 0.8, height: 0.8 });
  const drag = useRef<Drag>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  }, [bitmap]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current;
    const wrap = wrapRef.current;
    if (!d || !wrap) return;
    const r = wrap.getBoundingClientRect();
    const dx = (e.clientX - d.x) / r.width;
    const dy = (e.clientY - d.y) / r.height;
    const s = d.start;
    let { left, top, width, height } = s;
    if (d.mode === "move") {
      left = clamp(s.left + dx, 0, 1 - s.width);
      top = clamp(s.top + dy, 0, 1 - s.height);
    } else {
      const right = s.left + s.width;
      const bottom = s.top + s.height;
      if (d.mode.includes("w")) left = clamp(s.left + dx, 0, right - MIN);
      if (d.mode.includes("n")) top = clamp(s.top + dy, 0, bottom - MIN);
      const newRight = d.mode.includes("e") ? clamp(right + dx, left + MIN, 1) : right;
      const newBottom = d.mode.includes("s") ? clamp(bottom + dy, top + MIN, 1) : bottom;
      width = newRight - left;
      height = newBottom - top;
    }
    setBox({ left, top, width, height });
  }, []);

  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
    };
  }, [onPointerMove]);

  const begin = (mode: NonNullable<Drag>["mode"], e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, x: e.clientX, y: e.clientY, start: box };
  };

  const pct = (n: number) => `${n * 100}%`;
  const handle = "absolute size-5 rounded-full border-2 border-white bg-cobalt shadow touch-none";

  return (
    <div className="space-y-3 rounded-xl bg-cream p-4 ring-1 ring-[color:var(--line)]" data-testid="photo-cropper">
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-[color:var(--muted)]">{hint}</p>
      </div>
      <div ref={wrapRef} className="relative mx-auto w-fit max-w-full touch-none select-none">
        <canvas ref={canvasRef} className="block max-h-[60vh] max-w-full" />
        {/* Dim the photo outside the box (clipped to the photo). */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute" style={{ left: pct(box.left), top: pct(box.top), width: pct(box.width), height: pct(box.height), boxShadow: "0 0 0 9999px rgba(20,20,40,0.55)" }} />
        </div>
        <div
          className="absolute cursor-move ring-2 ring-white"
          style={{ left: pct(box.left), top: pct(box.top), width: pct(box.width), height: pct(box.height) }}
          onPointerDown={(e) => begin("move", e)}
          data-testid="crop-box"
        >
          <span className={`${handle} -left-2.5 -top-2.5 cursor-nwse-resize`} onPointerDown={(e) => begin("nw", e)} />
          <span className={`${handle} -right-2.5 -top-2.5 cursor-nesw-resize`} onPointerDown={(e) => begin("ne", e)} />
          <span className={`${handle} -bottom-2.5 -left-2.5 cursor-nesw-resize`} onPointerDown={(e) => begin("sw", e)} />
          <span className={`${handle} -bottom-2.5 -right-2.5 cursor-nwse-resize`} onPointerDown={(e) => begin("se", e)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={() => onDone(box)} data-testid="use-crop">
          Use this crop
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => onDone(null)}>
          Use the whole photo
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
