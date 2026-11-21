/**
 * Runs two image providers on the same 4 scenes (with the same character
 * reference) and saves the results side by side so you can pick one.
 *
 *   npm run compare -- --a gemini --b openai --character path/to/sheet.png
 *   npm run compare -- --a gemini --b mock            (no character: generic hero)
 *
 * Options: --style watercolor-storybook|bold-comic|soft-3d|paper-cutout|crayon
 *          --name Teddy   (the hero's name in prompts)
 * Output:  comparisons/<timestamp>/index.html, grid.png, and each image.
 * Real providers cost money: about $0.11 (Gemini 4K) to $0.30 (OpenAI) per image,
 * so a run is roughly $0.50 to $1.70.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const SCENES = [
  {
    title: "Full page, text at bottom",
    layout: "fullBleed",
    textZone: "bottom",
    scene: { action: "{name} runs across a meadow chasing a bright red kite, laughing", characters: ["{name}"], setting: "a sunny hilltop meadow with wildflowers", mood: "joyful, breezy", framing: "wide shot, full body" },
  },
  {
    title: "Picture on top, close-up emotion",
    layout: "imageTop",
    textZone: "bottom",
    scene: { action: "{name} hugs a small, shy lavender dragon who is smiling with relief", characters: ["{name}", "a small lavender dragon"], setting: "a cave lit by glowing crystals", mood: "tender, warm", framing: "medium close-up of faces" },
  },
  {
    title: "Two-page spread, big moment",
    layout: "spread",
    textZone: "left",
    scene: { action: "{name} steers a little bubble submarine past a giant friendly whale", characters: ["{name}", "a giant blue whale"], setting: "a glowing coral reef under the sea", mood: "awe, wonder", framing: "very wide panoramic shot" },
  },
  {
    title: "Night scene, text at top",
    layout: "fullBleed",
    textZone: "top",
    scene: { action: "{name} in pajamas looks out the bedroom window at a sky full of stars, holding a teddy bear", characters: ["{name}"], setting: "a cozy bedroom at night", mood: "calm, sleepy", framing: "medium shot from behind and to the side" },
  },
] as const;

async function main() {
  const { values } = parseArgs({
    options: {
      a: { type: "string", default: "gemini" },
      b: { type: "string", default: "openai" },
      character: { type: "string" },
      style: { type: "string", default: "watercolor-storybook" },
      name: { type: "string", default: "Teddy" },
    },
  });
  const { buildImageProvider } = await import("../lib/providers/registry");
  const { getTrim, illustrationTargetPx } = await import("../lib/print/geometry");
  const { ArtStyleSchema } = await import("../lib/schemas/theme");
  const sharp = (await import("sharp")).default;

  const style = ArtStyleSchema.parse(values.style);
  const which = [values.a, values.b].map((w) => {
    if (w !== "gemini" && w !== "openai" && w !== "mock") throw new Error(`Unknown provider "${w}". Use gemini, openai or mock.`);
    return w;
  });
  let characterRef = null;
  if (values.character) {
    const buf = fs.readFileSync(values.character);
    const meta = await sharp(buf).metadata();
    const png = await sharp(buf).resize(1536, 1536, { fit: "inside" }).png().toBuffer();
    characterRef = { data: png, mimeType: "image/png", width: meta.width ?? 0, height: meta.height ?? 0 };
  }
  const outDir = path.join(process.cwd(), "comparisons", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(outDir, { recursive: true });
  const trim = getTrim("square-8.5");

  const results: Array<{ provider: string; model: string; cells: Array<{ file: string; seconds: number; cost: number; error?: string }>; total: number }> = [];
  for (const w of which) {
    const provider = buildImageProvider(w);
    const row = { provider: provider.name, model: provider.model, cells: [] as Array<{ file: string; seconds: number; cost: number; error?: string }>, total: 0 };
    for (const [i, s] of SCENES.entries()) {
      const action = s.scene.action.replace("{name}", values.name!);
      const scene = { ...s.scene, action, characters: s.scene.characters.map((c) => c.replace("{name}", values.name!)), mustShow: [action], continuity: "" };
      const target = illustrationTargetPx(s.layout, trim);
      const t0 = Date.now();
      process.stdout.write(`${provider.name}: scene ${i + 1}/4 ... `);
      try {
        const r = await provider.generateIllustration({
          characterRef,
          bible: null,
          childName: values.name!,
          scene,
          style,
          aspect: target.aspect,
          targetPx: target,
          textZone: s.textZone,
          palette: [],
          label: `Scene ${i + 1}`,
        });
        const ext = r.value.mimeType === "image/svg+xml" ? "svg" : "png";
        const file = `${provider.name}-${i + 1}.${ext}`;
        fs.writeFileSync(path.join(outDir, file), r.value.data);
        const seconds = (Date.now() - t0) / 1000;
        row.cells.push({ file, seconds, cost: r.usage.costUsd });
        row.total += r.usage.costUsd;
        console.log(`done in ${seconds.toFixed(1)}s, $${r.usage.costUsd.toFixed(3)}, ${r.value.width}x${r.value.height}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        row.cells.push({ file: "", seconds: (Date.now() - t0) / 1000, cost: 0, error: msg });
        console.log(`failed: ${msg}`);
      }
    }
    results.push(row);
  }

  // Side-by-side page.
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<!doctype html><meta charset="utf-8"><title>Image provider comparison</title>
<style>body{font-family:system-ui;margin:24px;background:#faf7f2}table{border-collapse:collapse}td,th{padding:8px;vertical-align:top;border-bottom:1px solid #ddd}img{width:420px;height:auto;border-radius:8px;box-shadow:0 1px 4px #0002}small{color:#666}</style>
<h1>Image provider comparison</h1><p>Style: ${esc(style)} · hero: ${esc(values.name!)} · character reference: ${values.character ? esc(path.basename(values.character)) : "none"}</p>
<table><tr><th>Scene</th>${results.map((r) => `<th>${esc(r.provider)}<br><small>${esc(r.model)} · total $${r.total.toFixed(3)}</small></th>`).join("")}</tr>
${SCENES.map((s, i) => `<tr><td><b>${esc(s.title)}</b><br><small>${esc(s.scene.action.replace("{name}", values.name!))}</small></td>${results
    .map((r) => {
      const c = r.cells[i];
      return `<td>${c.error ? `<b>Failed:</b> ${esc(c.error)}` : `<img src="${esc(c.file)}"><br><small>${c.seconds.toFixed(1)}s · $${c.cost.toFixed(3)}</small>`}</td>`;
    })
    .join("")}</tr>`).join("\n")}
</table><p>Look for: the same recognizable child in every picture, no text or letters in the art, clean space where the text goes, and a consistent style.</p>`;
  fs.writeFileSync(path.join(outDir, "index.html"), html);

  // One PNG grid for quick viewing anywhere.
  const cell = 480;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  for (const [col, r] of results.entries()) {
    for (const [row, c] of r.cells.entries()) {
      if (!c.file) continue;
      const img = await sharp(path.join(outDir, c.file)).resize(cell, cell, { fit: "contain", background: "#faf7f2" }).png().toBuffer();
      composites.push({ input: img, left: col * (cell + 16) + 16, top: row * (cell + 16) + 56 });
    }
  }
  const header = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${results.length * (cell + 16) + 16}" height="48">${results
      .map((r, i) => `<text x="${i * (cell + 16) + 16}" y="32" font-family="sans-serif" font-size="22" font-weight="700">${esc(r.provider)} (${esc(r.model)})</text>`)
      .join("")}</svg>`,
  );
  composites.push({ input: header, left: 0, top: 0 });
  await sharp({ create: { width: results.length * (cell + 16) + 16, height: SCENES.length * (cell + 16) + 56, channels: 3, background: "#faf7f2" } })
    .composite(composites)
    .png()
    .toFile(path.join(outDir, "grid.png"));

  console.log(`\nSaved to ${path.relative(process.cwd(), outDir)}/ (open index.html, or grid.png)`);
  for (const r of results) console.log(`  ${r.provider} (${r.model}): $${r.total.toFixed(3)} for ${r.cells.filter((c) => !c.error).length} images`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
