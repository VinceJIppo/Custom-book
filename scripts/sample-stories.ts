/**
 * Sample stories from the ready-made story starters, written exactly the way the
 * app writes them when a parent reviews the story first: plan (from the starter),
 * write, editor review, rewrite, and a second review only for serious problems.
 * Pictures are not drawn. Produces one Markdown file to review, with timings,
 * costs, the plan, the editor's notes, the finished words and a feedback checklist.
 *
 *   npm run sample-stories                       all six base stories, each in its own world and voice
 *   npm run sample-stories -- --compare          also writes each as a brand-new story, for comparison
 *   npm run sample-stories -- --stories topsy-turvy-town:sideways-rain,wishing-garden:lumas-glow
 *   npm run sample-stories -- --hero Theo --age 5 --siblings "Oliver:3:he,Charlie:1:she" --grownup "Mom:Mama:she"
 *
 * Needs ANTHROPIC_API_KEY in .env.local (in a cloud session: STORYSTAR_ANTHROPIC_API_KEY in the environment) (about $0.30 to $0.60 per story).
 * Without it, the offline mock writer is used (free, formulaic: only for checking the script).
 * Output: story-lab/sample-stories-<time>.md (not committed).
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { CastMemberSnapshot } from "../lib/schemas/child";

const VOICE_FOR: Record<string, string> = { "topsy-turvy-town": "rhyming-mischief", "quiet-meadow": "quiet-wisdom", "wishing-garden": "quiet-wisdom" };

async function main() {
  const { values } = parseArgs({
    options: {
      // Every ready-made story of the house theme, in its own voice, unless --stories picks some.
      stories: { type: "string", default: "" },
      hero: { type: "string", default: "Theo" },
      age: { type: "string", default: "5" },
      pronouns: { type: "string", default: "he" },
      siblings: { type: "string", default: "Oliver:3:he,Charlie:1:she" },
      grownup: { type: "string", default: "" },
      length: { type: "string", default: "16" },
      compare: { type: "boolean", default: false },
    },
  });
  const { loadBuiltInThemeFiles } = await import("../lib/themes");
  const { getStoryProvider } = await import("../lib/providers/registry");
  const { applySetup } = await import("../lib/books/setup");
  const { BookOptionsSchema, readingLevelForAge } = await import("../lib/schemas/book");
  const { VOICES } = await import("../lib/schemas/voices");

  const themes = loadBuiltInThemeFiles();
  const story = getStoryProvider();
  if (story.name === "mock") console.log("No ANTHROPIC_API_KEY found: using the offline mock writer (only useful to check the script).\n");

  const age = Number(values.age);
  const cast: CastMemberSnapshot[] = [
    ...values.siblings!
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s, i) => {
        const [name, a, pr] = s.split(":");
        return { id: `sib-${i}`, kind: "child" as const, name, age: Number(a) || undefined, pronouns: (pr || "they") as "he" | "she" | "they", relationship: "sibling", part: `${values.hero}'s ${Number(a) < age ? "younger" : "older"} sibling, along for the whole adventure` };
      }),
    ...(values.grownup
      ? [(() => {
          const [name, nickname, pr] = values.grownup!.split(":");
          return { id: "grownup", kind: "grownup" as const, name, nickname: nickname || undefined, pronouns: (pr || "she") as "he" | "she" | "they", relationship: "parent" };
        })()]
      : []),
  ];

  const runs: Array<{ themeId: string; starterId?: string }> = [];
  const { houseStories } = await import("../lib/schemas/theme");
  const picked = values.stories || houseStories(themes).map((s) => `${s.theme.id}:${s.starter.id}`).join(",");
  for (const pair of picked.split(",")) {
    const [themeId, starterId] = pair.trim().split(":");
    runs.push({ themeId, starterId });
    if (values.compare) runs.push({ themeId });
  }

  const sections: string[] = [];
  let total = 0;
  for (const r of runs) {
    const theme = themes.find((t) => t.id === r.themeId);
    if (!theme) throw new Error(`Unknown theme ${r.themeId}`);
    const starter = r.starterId ? theme.starters?.find((s) => s.id === r.starterId) : undefined;
    if (r.starterId && !starter) throw new Error(`Theme ${theme.id} has no ready-made story ${r.starterId}. It has: ${(theme.starters ?? []).map((s) => s.id).join(", ")}`);
    const options = BookOptionsSchema.parse({
      length: Number(values.length),
      readingLevel: readingLevelForAge(age),
      style: theme.artDirection.defaultStyle,
      trimSize: "square-8.5",
      includePet: false,
      includeFriend: false,
      // The same voice the app uses: the ready-made story's own, else the theme's.
      voice: starter?.voice ?? VOICE_FOR[theme.id] ?? "classic",
      cast: cast.map((c) => ({ profileId: c.id, part: c.part })),
      starterId: starter?.id,
    });
    const child = { id: "sample-hero", firstName: values.hero!, age, pronouns: values.pronouns as "he" | "she" | "they", favorites: { colors: [], animals: [], foods: [], activities: [] }, friends: [] };
    const ctx = { child, theme, options, cast };
    const label = starter ? `Ready-made: "${starter.title}"` : "Brand-new story (experimental)";
    console.log(`${theme.name}: ${label}`);

    const t0 = Date.now();
    process.stdout.write("  planning ... ");
    const spine = await story.generateOutline(ctx);
    process.stdout.write("setting up the opening ... ");
    const setup = await story.planSetup(spine.value, ctx);
    const outline = { value: applySetup(spine.value, setup.value), usage: { ...spine.usage, costUsd: spine.usage.costUsd + setup.usage.costUsd } };
    const tPlan = (Date.now() - t0) / 1000;
    process.stdout.write(`${tPlan.toFixed(0)}s; writing and editing ... `);
    const stages: string[] = [];
    const t1 = Date.now();
    const written = await story.writeManuscript(outline.value, ctx, { onStage: async (s) => void stages.push(s) });
    const tWrite = (Date.now() - t1) / 1000;
    const cost = outline.usage.costUsd + written.usage.costUsd;
    total += cost;
    console.log(`${tWrite.toFixed(0)}s. Total ${(tPlan + tWrite).toFixed(0)}s, $${cost.toFixed(3)}`);

    const o = outline.value;
    const w = written.value;
    const majors = w.editorNotes.flatMap((n) => n.issues).filter((i) => i.severity !== "minor").length;
    sections.push(
      [
        `## ${theme.name}: ${o.title}`,
        "",
        `**${label}** · Voice: ${VOICES[options.voice ?? "classic"].label} · ${options.length} pages · Hero: ${child.firstName} (${age}) with ${cast.map((c) => `${c.name}${c.age ? ` (${c.age})` : ""}`).join(", ") || "no one else"}`,
        "",
        `**Time to readable story:** ${(tPlan + tWrite).toFixed(0)} seconds (plan ${tPlan.toFixed(0)}s, writing and editing ${tWrite.toFixed(0)}s; steps: ${stages.join(", ")}). **Cost:** $${cost.toFixed(3)}.`,
        "",
        ...(starter ? [`**The ready-made idea it started from:** ${starter.idea}`, ""] : []),
        "### The plan",
        `- **Premise:** ${o.premise}`,
        `- **How this world works:** ${o.worldRule || "(none)"}`,
        `- **Problem:** ${o.problem || "(none)"}`,
        ...(o.setup ? [`- **Opening (pages 1 to ${o.setup.journeyStartsOnPage - 1}):** ${o.setup.homeWorld} Wants: ${o.setup.heroWant} Then: ${o.setup.incitingIncident} Why it matters: ${o.setup.whyItMatters} Why the hero goes: ${o.setup.whyTheHero} Decision: ${o.setup.decision}`] : []),
        ...o.attempts.map((a, i) => `- **Try ${i + 1}:** ${a.attempt} *Fails because:* ${a.whyItFails}`),
        `- **Turning point:** ${o.turningPoint || "(none)"}`,
        `- **Resolution:** ${o.resolution || "(none)"}`,
        ...(o.characters.length ? ["", "**Characters (kept the same on every page)**", ...o.characters.map((c) => `- ${c.name}: ${c.species}; ${c.look}`)] : []),
        "",
        "### What the editor found",
        ...(w.editorNotes.length
          ? w.editorNotes.flatMap((n, i) => [`**Review ${i + 1}: ${n.verdict}.** ${n.overall}`, ...n.issues.map((x) => `- (${x.severity ?? "major"}) Page ${x.page}: ${x.problem} *Fix:* ${x.fix}`), ""])
          : ["(no editor pass with the mock writer)", ""]),
        `*${majors ? `${majors} serious problem(s) found, so it got a second review and polish.` : "No serious problems, so no second review was needed."}*`,
        "",
        "### The story",
        ...w.pages.flatMap((p) => [`**Page ${p.pageNumber}**`, "", p.text.split("\n").map((l) => (l ? `> ${l}` : ">")).join("\n"), ""]),
        `**Dedication:** ${w.dedication}`,
        "",
        `**Back cover:** ${w.backCoverBlurb}`,
        "",
        "### Your feedback",
        "- Does the plot make sense from start to finish? (yes / mostly / no)",
        "- Do the siblings and grown-ups each have a real part?",
        "- Did the ready-made idea come through, and did it still feel personal?",
        "- Anything confusing, flat or off-tone? Which pages?",
        "- Score out of 10:",
        "",
        "---",
        "",
      ].join("\n"),
    );
  }

  const header = [
    "# Sample stories from the ready-made story approach",
    "",
    `Written ${new Date().toLocaleString()} by the ${story.name === "mock" ? "offline mock writer (not representative)" : "real story pipeline"}, following the app's standard flow with story review on (no pictures). Total cost $${total.toFixed(3)}.`,
    "",
    values.compare ? "Each ready-made story is followed by a brand-new story with the same family and theme, for comparison." : "Run with `--compare` to also write each as a brand-new story for comparison.",
    "",
    "---",
    "",
  ];
  const outDir = path.join(process.cwd(), "story-lab");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `sample-stories-${new Date().toISOString().replace(/[:.]/g, "-")}.md`);
  fs.writeFileSync(file, (header.join("\n") + sections.join("\n")).replace(/\n{3,}/g, "\n\n"));
  console.log(`\nSaved ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
