import type { BatchImageProvider, BatchItem, BatchResult, BatchState, CharacterSheetRequest, EditRequest, ImageProvider, IllustrationRequest } from "./types";
import type { ImageData, WithUsage } from "../types";

/**
 * Labeled placeholder art as SVG. Shows the scene, the art style and the
 * reserved text area so layouts can be checked without an image API.
 */
const LONG_SIDE = 1024;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      lines.push(cur.trim());
      cur = w;
      if (lines.length === maxLines) break;
    } else cur += " " + w;
  }
  if (lines.length < maxLines && cur.trim()) lines.push(cur.trim());
  return lines;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function dims(aspect: number) {
  return aspect >= 1
    ? { width: LONG_SIDE, height: Math.round(LONG_SIDE / aspect) }
    : { width: Math.round(LONG_SIDE * aspect), height: LONG_SIDE };
}

function zoneRect(zone: IllustrationRequest["textZone"], w: number, h: number) {
  switch (zone) {
    case "top":
      return { x: w * 0.08, y: h * 0.06, w: w * 0.84, h: h * 0.28 };
    case "bottom":
      return { x: w * 0.08, y: h * 0.66, w: w * 0.84, h: h * 0.28 };
    case "left":
      return { x: w * 0.04, y: h * 0.1, w: w * 0.3, h: h * 0.5 };
    case "right":
      return { x: w * 0.66, y: h * 0.1, w: w * 0.3, h: h * 0.5 };
    default:
      return null;
  }
}

function svg(opts: { width: number; height: number; palette: string[]; title: string; lines: string[]; style: string; zone: IllustrationRequest["textZone"]; seed: number }) {
  const { width: w, height: h, palette } = opts;
  const [c1, c2, c3, c4] = [palette[0], palette[1] ?? palette[0], palette[2] ?? "#FFD54F", palette[3] ?? "#FFFFFF"];
  const zr = zoneRect(opts.zone, w, h);
  // Keep the character away from the text zone.
  const cx = opts.zone === "left" ? w * 0.65 : opts.zone === "right" ? w * 0.35 : w * (0.35 + ((opts.seed % 30) / 100));
  const cy = opts.zone === "top" ? h * 0.62 : opts.zone === "bottom" ? h * 0.38 : h * 0.5;
  const s = Math.min(w, h) / 1024;
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const r = ((opts.seed >> (i * 3)) % 60) + 40;
    const x = ((opts.seed >> i) % 1000) / 1000 * w;
    const y = ((opts.seed >> (i + 5)) % 1000) / 1000 * h;
    return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${(r * s).toFixed(0)}" fill="${c4}" opacity="0.18"/>`;
  }).join("");
  const textY = zr && opts.zone === "bottom" ? h * 0.08 : h - 40 * s - opts.lines.length * 30 * s;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <pattern id="hatch" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="16" stroke="#ffffff" stroke-width="3" opacity="0.35"/></pattern>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  ${blobs}
  <ellipse cx="${w / 2}" cy="${h * 1.05}" rx="${w * 0.8}" ry="${h * 0.3}" fill="${c3}" opacity="0.55"/>
  <g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) scale(${s.toFixed(3)})">
    <circle cx="0" cy="-90" r="60" fill="#FFE0BD" stroke="#5D4037" stroke-width="6"/>
    <circle cx="-20" cy="-98" r="7" fill="#5D4037"/><circle cx="20" cy="-98" r="7" fill="#5D4037"/>
    <path d="M -22 -70 Q 0 -50 22 -70" stroke="#5D4037" stroke-width="6" fill="none" stroke-linecap="round"/>
    <path d="M -55 -20 L 55 -20 L 40 110 L -40 110 Z" fill="${c3}" stroke="#5D4037" stroke-width="6"/>
    <path d="M -40 110 L -45 190 M 40 110 L 45 190 M -55 -10 L -110 50 M 55 -10 L 110 -60" stroke="#5D4037" stroke-width="12" stroke-linecap="round"/>
    <path d="M 110 -60 l 12 -30 l 12 30 l 30 0 l -24 18 l 10 30 l -28 -18 l -28 18 l 10 -30 l -24 -18 z" fill="#FFF59D" stroke="#F9A825" stroke-width="3"/>
  </g>
  ${
    zr
      ? `<rect x="${zr.x}" y="${zr.y}" width="${zr.w}" height="${zr.h}" rx="${18 * s}" fill="url(#hatch)" stroke="#ffffff" stroke-width="${3 * s}" stroke-dasharray="${14 * s} ${10 * s}" opacity="0.9"/>
  <text x="${zr.x + zr.w / 2}" y="${zr.y + zr.h / 2}" font-family="sans-serif" font-size="${22 * s}" fill="#ffffff" text-anchor="middle" opacity="0.9">clear space for text</text>`
      : ""
  }
  <g font-family="sans-serif" fill="#ffffff">
    <rect x="${16 * s}" y="${16 * s}" width="${250 * s}" height="${44 * s}" rx="${8 * s}" fill="#000000" opacity="0.35"/>
    <text x="${30 * s}" y="${46 * s}" font-size="${24 * s}" font-weight="700">MOCK ART · ${esc(opts.style)}</text>
    <text x="${w - 24 * s}" y="${48 * s}" font-size="${30 * s}" font-weight="700" text-anchor="end">${esc(opts.title)}</text>
    ${opts.lines
      .map((l, i) => `<text x="${w / 2}" y="${(textY + i * 30 * s).toFixed(0)}" font-size="${22 * s}" text-anchor="middle" opacity="0.95">${esc(l)}</text>`)
      .join("\n    ")}
  </g>
</svg>`;
}

function toImage(markup: string, width: number, height: number): ImageData {
  return { data: Buffer.from(markup, "utf8"), mimeType: "image/svg+xml", width, height };
}

const free = { provider: "mock", model: "mock-image", imageCalls: 1, costUsd: 0 };

/** Mock batches live in memory: a restarted server reads them as expired (and falls back). */
const mockBatches = new Map<string, BatchItem[]>();
let mockBatchSeq = 0;

export class MockImageProvider implements ImageProvider, BatchImageProvider {
  readonly name = "mock";
  readonly model = "mock-image";

  async generateCharacterSheet(input: CharacterSheetRequest): Promise<WithUsage<ImageData[]>> {
    const seed = Date.now();
    const palettes = [["#90CAF9", "#CE93D8"], ["#A5D6A7", "#FFF59D"], ["#FFCC80", "#F48FB1"]];
    const value = Array.from({ length: input.count }, (_, i) => {
      const { width, height } = dims(1.5);
      return toImage(
        svg({ width, height, palette: palettes[i % 3], title: `Character option ${i + 1}`, lines: ["Front · three-quarter · portrait", `from ${input.photos.length} photo(s)`], style: input.style, zone: null, seed: hash(`sheet${i}${seed}`) }),
        width,
        height,
      );
    });
    return { value, usage: { ...free, imageCalls: input.count } };
  }

  async generateIllustration(req: IllustrationRequest): Promise<WithUsage<ImageData>> {
    const { width, height } = dims(req.aspect);
    const maxChars = Math.round(width / 13);
    const lines = wrap(req.note ? `${req.scene.action} (note: ${req.note})` : req.scene.action, maxChars, 3);
    const markup = svg({ width, height, palette: req.palette, title: req.label, lines, style: req.style, zone: req.textZone, seed: hash(req.label + req.scene.action + (req.note ?? "")) });
    return { value: toImage(markup, width, height), usage: free };
  }

  async editIllustration(input: EditRequest): Promise<WithUsage<ImageData>> {
    const { width, height } = input.image;
    const markup = svg({
      width,
      height,
      palette: ["#B0BEC5", "#90A4AE"],
      title: "Edited",
      lines: wrap(`Edit: ${input.instruction}`, Math.round(width / 13), 3),
      style: input.style,
      zone: input.textZone,
      seed: hash(input.instruction),
    });
    return { value: toImage(markup, width, height), usage: free };
  }

  async submitIllustrationBatch(items: BatchItem[]): Promise<string[]> {
    const name = `batches/mock-${++mockBatchSeq}-${Date.now()}`;
    mockBatches.set(name, items);
    return [name];
  }

  async getIllustrationBatch(name: string): Promise<{ state: BatchState; results?: BatchResult[] }> {
    const items = mockBatches.get(name);
    if (!items) return { state: "expired" };
    const results: BatchResult[] = [];
    for (const it of items) results.push({ key: it.key, image: await this.generateIllustration(it.req) });
    return { state: "succeeded", results };
  }
}
