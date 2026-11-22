/**
 * Paints sample pages for the built-in themes, shown on the theme cards.
 * Uses your image provider (Gemini) at 1K, about $0.03 a picture.
 *
 *   npm run theme-samples                    every theme without samples yet (2 pictures each)
 *   npm run theme-samples -- wishing-garden  one theme (replaces its samples)
 *   npm run theme-samples -- --all           every theme (replaces all samples)
 *
 * Pictures go to public/theme-samples/<theme>/ as JPEGs. No photos are used:
 * the child is a generic storybook child.
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";

async function main() {
  const sharp = (await import("sharp")).default;
  const { getConfig } = await import("../lib/config");
  const { imageProviderChoice, getImageProvider } = await import("../lib/providers/registry");
  const { GeminiImageProvider } = await import("../lib/providers/gemini/image");
  const { loadBuiltInThemeFiles } = await import("../lib/themes");

  const which = imageProviderChoice();
  if (which === "mock") throw new Error("Sample pages need a real image provider. Set GEMINI_API_KEY (and IMAGE_PROVIDER=gemini) in .env.local.");
  const cfg = getConfig();
  // Samples are small on screen: 1K pictures are plenty and cheapest.
  const image = which === "gemini" ? new GeminiImageProvider({ apiKey: cfg.GEMINI_API_KEY!, model: cfg.GEMINI_IMAGE_MODEL, pageSize: "1K" }) : getImageProvider();

  const arg = process.argv[2];
  const themes = loadBuiltInThemeFiles().filter((t) => !arg || arg === "--all" || t.id === arg);
  if (!themes.length) throw new Error(`No built-in theme called ${arg}`);
  let spent = 0;
  for (const t of themes) {
    const dir = path.join(process.cwd(), "public", "theme-samples", t.id);
    const has = fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith(".jpg"));
    if (has && !arg) {
      console.log(`${t.name}: already has samples (skip)`);
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    const beats = [t.storyBeats[0], t.storyBeats[Math.floor(t.storyBeats.length / 2)]];
    for (const [i, beat] of beats.entries()) {
      const friend = t.supportingCast[i % t.supportingCast.length];
      const r = await image.generateIllustration({
        characterRef: null,
        bible: null,
        childName: "the child",
        scene: {
          action: `A cheerful young child (about five) and ${friend.name} in a moment of "${beat}"`,
          characters: ["the child", friend.name],
          setting: t.setting,
          mood: t.artDirection.mood,
          framing: "medium-wide storybook scene, whole figures in view",
          mustShow: [`${friend.name}: ${friend.look}`],
          continuity: "",
        },
        style: t.artDirection.defaultStyle,
        aspect: 1,
        textZone: null,
        palette: t.artDirection.palette,
        label: `${t.name} sample ${i + 1}`,
      });
      spent += r.usage.costUsd;
      await sharp(r.value.data).resize(720, 720, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(dir, `${i + 1}.jpg`));
      console.log(`${t.name}: sample ${i + 1} saved`);
    }
  }
  console.log(`Done. About $${spent.toFixed(2)} of image generation.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
