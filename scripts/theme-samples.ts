/**
 * Paints sample pages for the built-in themes, shown on the theme cards.
 * Uses your image provider (Gemini) at 1K, about $0.03 a picture.
 *
 *   npm run theme-samples                    any missing sample pictures (2 per theme, plus one per
 *                                            ready-made story for the story cards); safe to re-run
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
  // Hidden themes aren't shown to parents, so they don't need pictures (name one to paint it anyway).
  const themes = loadBuiltInThemeFiles().filter((t) => (arg && arg !== "--all" ? t.id === arg : !t.hidden));
  if (!themes.length) throw new Error(`No built-in theme called ${arg}`);
  let spent = 0;
  const failed: string[] = [];
  for (const t of themes) {
    const dir = path.join(process.cwd(), "public", "theme-samples", t.id);
    fs.mkdirSync(dir, { recursive: true });
    const beats = [t.storyBeats[0], t.storyBeats[Math.floor(t.storyBeats.length / 2)]];
    for (const [i, beat] of beats.entries()) {
      const file = path.join(dir, `${i + 1}.jpg`);
      // Without a theme name, only missing pictures are drawn (so a re-run finishes what's left).
      if (!arg && fs.existsSync(file)) {
        console.log(`${t.name}: sample ${i + 1} already there (skip)`);
        continue;
      }
      // A real-world base story may bring no made-up characters: then the sample shows just the child.
      const friend = t.supportingCast.length ? t.supportingCast[i % t.supportingCast.length] : null;
      const req = {
        characterRef: null,
        bible: null,
        childName: "the child",
        scene: {
          action: `A cheerful young child (about five)${friend ? ` and ${friend.name}` : ""} in a moment of "${beat}"`,
          characters: ["the child", ...(friend ? [friend.name] : [])],
          setting: t.setting,
          mood: t.artDirection.mood,
          framing: "medium-wide storybook scene, whole figures in view",
          mustShow: friend ? [`${friend.name}: ${friend.look}`] : [],
          continuity: "",
        },
        style: t.artDirection.defaultStyle,
        aspect: 1,
        textZone: null,
        palette: t.artDirection.palette,
        label: `${t.name} sample ${i + 1}`,
      };
      // Network drops ("terminated", "fetch failed") happen: try up to 3 times, then move on.
      let done = false;
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        try {
          const r = await image.generateIllustration(req);
          spent += r.usage.costUsd;
          await sharp(r.value.data).resize(720, 720, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
          console.log(`${t.name}: sample ${i + 1} saved`);
          done = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`${t.name}: sample ${i + 1} didn't work (try ${attempt} of 3): ${msg.slice(0, 160)}`);
          if (attempt < 3) await new Promise((res) => setTimeout(res, attempt * 5000));
        }
      }
      if (!done) failed.push(`${t.name} sample ${i + 1}`);
    }
    // One picture per ready-made story, for the "Pick a story" cards.
    const storyDir = path.join(dir, "stories");
    fs.mkdirSync(storyDir, { recursive: true });
    for (const st of t.starters ?? []) {
      const file = path.join(storyDir, `${st.id}.jpg`);
      if (!arg && fs.existsSync(file)) {
        console.log(`${t.name}: "${st.title}" picture already there (skip)`);
        continue;
      }
      const who = t.supportingCast.filter((c) => st.idea.includes(c.name) || (st.summary ?? "").includes(c.name)).slice(0, 2);
      const req = {
        characterRef: null,
        bible: null,
        childName: "the child",
        scene: {
          action: `A cheerful young child (about five)${who.length ? ` with ${who.map((c) => c.name).join(" and ")}` : ""} at the start of this story: ${st.summary ?? st.title}`,
          characters: ["the child", ...who.map((c) => c.name)],
          setting: t.setting,
          mood: t.artDirection.mood,
          framing: "medium-wide storybook scene, whole figures in view",
          mustShow: who.map((c) => `${c.name}: ${c.look}`),
          continuity: "",
        },
        style: t.artDirection.defaultStyle,
        aspect: 1,
        textZone: null,
        palette: t.artDirection.palette,
        label: `${t.name}: ${st.title}`,
      };
      let done = false;
      for (let attempt = 1; attempt <= 3 && !done; attempt++) {
        try {
          const r = await image.generateIllustration(req);
          spent += r.usage.costUsd;
          await sharp(r.value.data).resize(720, 720, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
          console.log(`${t.name}: "${st.title}" picture saved`);
          done = true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.log(`${t.name}: "${st.title}" didn't work (try ${attempt} of 3): ${msg.slice(0, 160)}`);
          if (attempt < 3) await new Promise((res) => setTimeout(res, attempt * 5000));
        }
      }
      if (!done) failed.push(`${t.name}: ${st.title}`);
    }
  }
  if (failed.length) console.log(`\nStill missing: ${failed.join(", ")}. Run the same command again to finish them (finished pictures are skipped).`);
  console.log(`Done. About $${spent.toFixed(2)} of image generation.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
