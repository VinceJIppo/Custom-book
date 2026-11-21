/**
 * Story Lab: write a book's words without the app, the database or any images,
 * so you can judge (and tune) the storytelling quickly and cheaply.
 *
 *   npm run story:lab -- --theme topsy-turvy-town --name Oliver --age 5
 *   npm run story:lab -- --theme space-explorer --name Mia --age 7 --voice adventure --length 16 \
 *        --lesson "sharing" --likes "otters, pancakes" --instructions "her dog Pip comes along"
 *
 * Options:
 *   --theme      a built-in theme id (run with --list to see them)
 *   --name       the hero's first name           --age   2 to 8 (sets the reading level)
 *   --pronouns   he | she | they                 --voice rhyming-mischief | classic | bedtime | adventure
 *   --length     12 | 16 | 20 | 24               --lesson e.g. "being brave"
 *   --likes      comma list of favorite things (animals, foods, activities)
 *   --instructions  free text from the parent
 *   --runs N     write N versions to compare     --list  list themes and exit
 *
 * Uses the same story pipeline as the app (spine, manuscript, editor review,
 * one rewrite if needed, art direction). With ANTHROPIC_API_KEY set it costs
 * about $0.25 to $0.45 per run; without it, the offline mock writer is used.
 * Output: story-lab/<timestamp>-<theme>.md (gitignored).
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

async function main() {
  const { values } = parseArgs({
    options: {
      theme: { type: "string", default: "topsy-turvy-town" },
      name: { type: "string", default: "Oliver" },
      age: { type: "string", default: "5" },
      pronouns: { type: "string", default: "he" },
      voice: { type: "string", default: "rhyming-mischief" },
      length: { type: "string", default: "12" },
      lesson: { type: "string" },
      likes: { type: "string", default: "" },
      instructions: { type: "string" },
      runs: { type: "string", default: "1" },
      list: { type: "boolean", default: false },
    },
  });
  const { loadBuiltInThemeFiles } = await import("../lib/themes");
  const { getStoryProvider } = await import("../lib/providers/registry");
  const { BookOptionsSchema, readingLevelForAge } = await import("../lib/schemas/book");
  const { VOICES } = await import("../lib/schemas/voices");

  const themes = loadBuiltInThemeFiles();
  if (values.list) {
    for (const t of themes) console.log(`${t.id.padEnd(22)} ${t.name}: ${t.pitch}`);
    return;
  }
  const theme = themes.find((t) => t.id === values.theme);
  if (!theme) throw new Error(`Unknown theme "${values.theme}". Run with --list to see the themes.`);
  const age = Number(values.age);
  const likes = values.likes!.split(",").map((s) => s.trim()).filter(Boolean);
  const options = BookOptionsSchema.parse({
    length: Number(values.length),
    readingLevel: readingLevelForAge(age),
    style: theme.artDirection.defaultStyle,
    trimSize: "square-8.5",
    includePet: false,
    includeFriend: false,
    voice: values.voice,
    instructions: values.instructions,
  });
  const child = {
    id: "story-lab",
    firstName: values.name!,
    age,
    pronouns: values.pronouns as "he" | "she" | "they",
    favorites: { colors: [], animals: [], foods: [], activities: likes },
    friends: [],
    lesson: values.lesson,
  };
  const ctx = { child, theme, options };
  const story = getStoryProvider();
  const outDir = path.join(process.cwd(), "story-lab");
  fs.mkdirSync(outDir, { recursive: true });
  if (story.name === "mock") console.log("No ANTHROPIC_API_KEY found: using the offline mock writer (free, but formulaic).");

  for (let run = 1; run <= Number(values.runs); run++) {
    const t0 = Date.now();
    process.stdout.write(`Run ${run}: planning the story spine ... `);
    const outline = await story.generateOutline(ctx);
    process.stdout.write("writing, editing and directing the art ... ");
    const book = await story.generatePages(outline.value, ctx);
    const cost = outline.usage.costUsd + book.usage.costUsd;
    const o = outline.value;
    const b = book.value;

    const md = [
      `# ${o.title}`,
      "",
      `Theme: ${theme.name} · Voice: ${VOICES[options.voice ?? "classic"].label} · Hero: ${child.firstName}, age ${age} · ${options.length} pages · Writer: ${story.name} · Cost: $${cost.toFixed(3)}`,
      "",
      "## The story spine",
      `- **Premise:** ${o.premise}`,
      `- **World rule:** ${o.worldRule || "(none)"}`,
      `- **Problem:** ${o.problem || "(none)"}`,
      `- **Goal:** ${o.goal || "(none)"}`,
      ...o.attempts.map((a, i) => `- **Attempt ${i + 1}:** ${a.attempt} *Fails because:* ${a.whyItFails}`),
      `- **Turning point:** ${o.turningPoint || "(none)"}`,
      `- **Resolution:** ${o.resolution || "(none)"}`,
      `- **Lesson, shown:** ${o.lessonShown || "(none)"}`,
      `- **Ending echo:** ${o.endingEcho || "(none)"}`,
      ...(o.setups.length ? ["", "**Setups and payoffs**", ...o.setups.map((s) => `- ${s.item}: set up on page ${s.setUpOnPage}, pays off on page ${s.paysOffOnPage}`)] : []),
      ...(o.continuity.length ? ["", "**Continuity**", ...o.continuity.map((c) => `- ${c.fact} (pages ${c.fromPage} to ${c.toPage})`)] : []),
      "",
      "## Editor's notes",
      ...(b.editorNotes.length
        ? b.editorNotes.flatMap((n, i) => [`**Review ${i + 1}: ${n.verdict}.** ${n.overall}`, ...n.issues.map((x) => `- Page ${x.page}: ${x.problem} *Fix:* ${x.fix}`), ""])
        : ["(no editor pass with the mock writer)", ""]),
      "## Story summary (given to every illustration)",
      b.storySummary,
      "",
      "## The book",
      ...b.pages.flatMap((p) => [
        `### Page ${p.pageNumber}`,
        p.text.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n"),
        "",
        `*Picture:* ${p.scene.action} (${p.scene.setting}; ${p.scene.mood}; ${p.scene.framing}; ${p.layout}, text ${p.textZone})`,
        ...(p.scene.mustShow.length ? ["", `*Must show:* ${p.scene.mustShow.join("; ")}`] : []),
        ...(p.scene.continuity ? ["", `*Continuity:* ${p.scene.continuity}`] : []),
        "",
      ]),
      "## Cover",
      `*Picture:* ${b.coverScene.action}`,
      "",
      `**Dedication:** ${b.dedication}`,
      "",
      `**Back cover:** ${b.backCoverBlurb}`,
      "",
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");

    const file = path.join(outDir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${theme.id}-${run}.md`);
    fs.writeFileSync(file, md + "\n");
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)}s, $${cost.toFixed(3)}\n  ${path.relative(process.cwd(), file)}`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
