/**
 * Story scorecard: measures whether stories make sense, so changes to the writing
 * steps can be compared instead of eyeballed.
 *
 * Writes a set of stories the way the app does (plan, setup, write, blind read,
 * edit, rewrite, verse), then scores each FINISHED story with a fresh check: a
 * reader who never saw the plan retells it, and the editor rates how much of the
 * plan came through (retellingMatch), plus how many moments would lose a listener.
 *
 *   npm run story-scorecard                          10 stories, 12 pages, mixed themes and voices
 *   npm run story-scorecard -- --count 4 --length 16
 *   npm run story-scorecard -- --label after-fix --compare story-lab/scorecard-<earlier>.json
 *
 * Needs ANTHROPIC_API_KEY in .env.local (roughly $0.40 to $0.90 per story; 10 stories
 * is a few dollars). Without it, the offline mock writer is used (only checks the script).
 * Output: story-lab/scorecard-<label or time>.md and .json (not committed).
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import type { CastMemberSnapshot } from "../lib/schemas/child";

interface Row {
  theme: string;
  kind: string;
  voice: string;
  title: string;
  retellingMatch: number;
  confusing: number;
  majorIssues: number;
  seconds: number;
  costUsd: number;
  retelling: string;
  issues: string[];
  words: string;
  error?: string;
}

const VOICES = ["classic", "rhyming-mischief", "quiet-wisdom", "adventure", "bedtime"] as const;

async function main() {
  const { values } = parseArgs({
    options: {
      count: { type: "string", default: "10" },
      length: { type: "string", default: "12" },
      label: { type: "string", default: "" },
      compare: { type: "string", default: "" },
    },
  });
  const { loadBuiltInThemeFiles } = await import("../lib/themes");
  const { getStoryProvider } = await import("../lib/providers/registry");
  const { applySetup } = await import("../lib/books/setup");
  const { completeGuide } = await import("../lib/books/appearance");
  const { BookOptionsSchema } = await import("../lib/schemas/book");

  const story = getStoryProvider();
  if (story.name === "mock") console.log("No ANTHROPIC_API_KEY found: using the offline mock writer (scores are meaningless; this only checks the script).\n");
  const themes = loadBuiltInThemeFiles().filter((t) => !t.hidden);
  const count = Math.max(1, Number(values.count) || 10);
  const length = Number(values.length) || 12;

  // A family with enough people to test the story budget.
  const child = { id: "score-hero", firstName: "Theo", age: 5, pronouns: "he" as const, favorites: { colors: ["green"], animals: ["otters"], foods: ["pancakes"], activities: ["building forts"] }, friends: [] };
  const cast: CastMemberSnapshot[] = [
    { id: "sib", kind: "child", name: "Oliver", age: 3, pronouns: "he", relationship: "sibling", part: "Theo's little brother" },
    { id: "mom", kind: "grownup", name: "Bina", nickname: "Mama", pronouns: "she", relationship: "Mom" },
  ];

  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const theme = themes[i % themes.length];
    const starters = theme.starters ?? [];
    // Alternate ready-made stories and brand-new ones.
    const starter = i % 2 === 0 ? starters[Math.floor(i / 2) % Math.max(1, starters.length)] : undefined;
    const voice = VOICES[i % VOICES.length];
    const options = BookOptionsSchema.parse({ length, readingLevel: "4-6", style: theme.artDirection.defaultStyle, trimSize: "square-8.5", includePet: false, includeFriend: false, voice, cast: cast.map((c) => ({ profileId: c.id, part: c.part })), starterId: starter?.id });
    const ctx = { child, theme, options, cast };
    const kind = starter ? `ready-made: ${starter.title}` : "brand-new";
    process.stdout.write(`${i + 1}/${count} ${theme.name} (${kind}, ${voice}) ... `);
    const t0 = Date.now();
    try {
      const spine = await story.generateOutline(ctx);
      const planned = { ...spine.value, characters: completeGuide(spine.value.characters, ctx) };
      const setup = await story.planSetup(planned, ctx);
      const outline = applySetup(planned, setup.value);
      const written = await story.writeManuscript(outline, ctx);
      const score = story.scoreStory ? await story.scoreStory(outline, written.value.pages, ctx) : null;
      const cost = spine.usage.costUsd + setup.usage.costUsd + written.usage.costUsd + (score?.usage.costUsd ?? 0);
      const s = score?.value;
      rows.push({
        theme: theme.name,
        kind,
        voice,
        title: outline.title,
        retellingMatch: s?.retellingMatch ?? 1,
        confusing: s?.confusing ?? 0,
        majorIssues: s?.majorIssues ?? 0,
        seconds: Math.round((Date.now() - t0) / 1000),
        costUsd: cost,
        retelling: s?.retelling ?? "",
        issues: (s?.issues ?? []).map((x) => `${x.severity === "minor" ? "minor" : "MAJOR"} p${x.page}: ${x.problem}`),
        words: written.value.pages.map((p) => `**Page ${p.pageNumber}**\n\n> ${p.text.replace(/\n/g, "\n> ")}`).join("\n\n"),
      });
      console.log(`match ${(s?.retellingMatch ?? 1).toFixed(2)}, ${s?.confusing ?? 0} confusing, ${s?.majorIssues ?? 0} major, ${rows.at(-1)!.seconds}s, $${cost.toFixed(2)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`failed: ${msg.slice(0, 160)}`);
      rows.push({ theme: theme.name, kind, voice, title: "", retellingMatch: 0, confusing: 0, majorIssues: 0, seconds: Math.round((Date.now() - t0) / 1000), costUsd: 0, retelling: "", issues: [], words: "", error: msg });
    }
  }

  const ok = rows.filter((r) => !r.error);
  const avg = (f: (r: Row) => number) => (ok.length ? ok.reduce((s, r) => s + f(r), 0) / ok.length : 0);
  const summary = {
    stories: rows.length,
    failed: rows.length - ok.length,
    avgRetellingMatch: avg((r) => r.retellingMatch),
    avgConfusing: avg((r) => r.confusing),
    avgMajorIssues: avg((r) => r.majorIssues),
    cleanStories: ok.filter((r) => r.retellingMatch >= 0.9 && r.confusing === 0 && r.majorIssues === 0).length,
    avgSeconds: avg((r) => r.seconds),
    avgCostUsd: avg((r) => r.costUsd),
  };

  let compareLines: string[] = [];
  if (values.compare) {
    const prev = JSON.parse(fs.readFileSync(values.compare, "utf8")).summary as typeof summary;
    const d = (a: number, b: number, digits = 2) => `${a.toFixed(digits)} → ${b.toFixed(digits)} (${b - a >= 0 ? "+" : ""}${(b - a).toFixed(digits)})`;
    compareLines = [
      `## Compared with ${path.basename(values.compare)}`,
      "",
      `- Retelling match (higher is better): ${d(prev.avgRetellingMatch, summary.avgRetellingMatch)}`,
      `- Confusing moments per story (lower is better): ${d(prev.avgConfusing, summary.avgConfusing)}`,
      `- Major issues per story (lower is better): ${d(prev.avgMajorIssues, summary.avgMajorIssues)}`,
      `- Clean stories: ${prev.cleanStories} of ${prev.stories} → ${summary.cleanStories} of ${summary.stories}`,
      `- Time per story: ${d(prev.avgSeconds, summary.avgSeconds, 0)} s · Cost per story: ${d(prev.avgCostUsd, summary.avgCostUsd)} $`,
      "",
    ];
  }

  const stamp = values.label || new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "story-lab");
  fs.mkdirSync(dir, { recursive: true });
  const md = [
    `# Story scorecard${values.label ? `: ${values.label}` : ""}`,
    "",
    `${rows.length} stories of ${length} pages, written ${new Date().toLocaleString()} by ${story.name === "mock" ? "the offline mock writer (scores meaningless)" : "Claude"}. Each finished story was scored by a fresh reader who never saw the plan.`,
    "",
    `**Retelling match:** ${summary.avgRetellingMatch.toFixed(2)} (1.00 = a listener retold the whole planned story) · **Confusing moments:** ${summary.avgConfusing.toFixed(1)} per story · **Major issues:** ${summary.avgMajorIssues.toFixed(1)} per story · **Clean stories:** ${summary.cleanStories} of ${rows.length} · **Time:** ${summary.avgSeconds.toFixed(0)} s · **Cost:** $${summary.avgCostUsd.toFixed(2)} per story${summary.failed ? ` · **Failed:** ${summary.failed}` : ""}`,
    "",
    ...compareLines,
    "| # | Theme | Story | Voice | Match | Confusing | Major | Time | Cost |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r, i) => `| ${i + 1} | ${r.theme} | ${r.error ? "failed" : r.kind} | ${r.voice} | ${r.retellingMatch.toFixed(2)} | ${r.confusing} | ${r.majorIssues} | ${r.seconds}s | $${r.costUsd.toFixed(2)} |`),
    "",
    ...rows.flatMap((r, i) => [
      `## ${i + 1}. ${r.title || r.theme} (${r.kind}, ${r.voice})`,
      "",
      r.error ? `Failed: ${r.error}` : "",
      r.retelling ? `**What a first-time listener understood:**\n\n${r.retelling.split("\n").map((l) => `- ${l}`).join("\n")}` : "",
      r.issues.length ? `\n**Editor's notes on the finished story:**\n\n${r.issues.map((x) => `- ${x}`).join("\n")}` : "",
      "",
      r.words,
      "",
      "**Your notes:** ",
      "",
    ]),
  ].join("\n");
  const base = path.join(dir, `scorecard-${stamp}`);
  fs.writeFileSync(`${base}.md`, md);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ summary, rows: rows.map(({ words: _w, ...r }) => r) }, null, 2));
  console.log(`\nRetelling match ${summary.avgRetellingMatch.toFixed(2)}, ${summary.cleanStories} of ${rows.length} clean, $${summary.avgCostUsd.toFixed(2)} and ${summary.avgSeconds.toFixed(0)}s per story.`);
  console.log(`Wrote ${base}.md and .json`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
