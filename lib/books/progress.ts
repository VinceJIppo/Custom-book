import { db } from "../db";

export type StepState = "waiting" | "working" | "done" | "failed";

export interface BookProgress {
  steps: Array<{ id: string; label: string; state: StepState; detail?: string }>;
  illustrations: { done: number; failed: number; total: number };
  failedJobs: number;
  costUsd: number;
  /** Pictures are waiting in the overnight (batch) queue. */
  overnight?: boolean;
  /** "story": the words are being written (pictures come after approval). */
  phase?: "story" | "pictures";
  /** The story idea in one line, shown as soon as the plan is made. */
  premise?: string;
  percent: number;
  /** Admins only: why jobs failed, grouped, with a plain-English hint. */
  problems?: Array<{ count: number; hint: string; detail: string }>;
}

/** Turns a provider error into advice an admin can act on. */
export function explainFailure(error: string): string {
  const e = error.toLowerCase();
  if (/credit|prepay|billing|balance|payment required|402/.test(e)) return "The image or story service is out of credits or has no billing set up. Add credits (Gemini: aistudio.google.com/billing; Anthropic: console.anthropic.com), then click Try again.";
  if (/429|resource_exhausted|quota|rate limit|too many requests/.test(e)) return "Too many requests at once for your account's limit. Set WORKER_CONCURRENCY=1 in .env.local, restart, then click Try again.";
  if (/401|403|api key|permission|unauthenticated|invalid.*key/.test(e)) return "The API key was refused. Check the key in .env.local (GEMINI_API_KEY or ANTHROPIC_API_KEY) and restart.";
  if (/safety|blocked|refus|declined|prohibited/.test(e)) return "The service declined this picture or text for safety reasons. Try again, or change the page note or theme wording.";
  if (/timeout|timed out|econnreset|fetch failed|network|503|502|500|overloaded|unavailable/.test(e)) return "The service was busy or unreachable for a moment. Click Try again in a few minutes.";
  return "See the detail below. Click Try again; if it keeps failing, send the detail to support.";
}

function stateOf(jobs: Array<{ status: string }>): StepState {
  if (!jobs.length) return "waiting";
  if (jobs.some((j) => j.status === "succeeded")) return "done";
  if (jobs.every((j) => j.status === "failed")) return "failed";
  if (jobs.some((j) => j.status === "running")) return "working";
  return "working";
}

/** Plain-English progress for the live progress panel. */
export async function getBookProgress(bookId: string, expectedStoryPages: number, opts: { withProblems?: boolean } = {}): Promise<BookProgress> {
  const [book, jobs, pages] = await Promise.all([
    db.book.findUnique({ where: { id: bookId }, select: { status: true, outline: true } }),
    db.generationJob.findMany({ where: { bookId }, orderBy: { createdAt: "asc" }, select: { type: true, status: true, costUsd: true, error: true, attempts: true, maxAttempts: true } }),
    db.page.findMany({ where: { bookId, kind: "story" }, select: { imageStatus: true } }),
  ]);
  const of = (t: string) => jobs.filter((j) => j.type === t);
  // A rewritten story runs these again: only the latest run counts.
  const latest = (t: string) => of(t).slice(-1);
  const outline = stateOf(latest("book.outline"));
  const text = stateOf(latest("book.pages"));
  const cover = stateOf(latest("book.cover"));
  const draft = (book?.outline ?? null) as { premise?: string; drafting?: string } | null;
  const premise = draft?.premise || undefined;
  const pictureJobs = jobs.some((j) => ["page.illustrate", "book.cover", "book.batch", "book.artdirect"].includes(j.type));
  if (!pictureJobs && book && (book.status === "generating" || book.status === "story_review" || book.status === "failed")) {
    // Writing the words: the parent reads them before any picture is drawn.
    const stage = draft?.drafting ?? (text === "done" ? "done" : outline === "done" ? "writing" : "planning");
    const order = ["planning", "writing", "editing", "polishing", "done"];
    const at = Math.max(0, order.indexOf(stage));
    const st = (i: number): StepState => (text === "failed" || outline === "failed") && at === i ? "failed" : at > i || book.status === "story_review" ? "done" : at === i ? "working" : "waiting";
    const steps = [
      { id: "outline", label: "Planning the story", state: outline === "done" ? "done" : outline === "failed" ? "failed" : "working", detail: outline === "done" ? undefined : "about a minute" },
      { id: "pages", label: "Writing every page", state: outline !== "done" ? "waiting" : st(1), detail: at === 1 ? "about a minute" : undefined },
      { id: "edit", label: "Our editor reads it and fixes anything unclear", state: outline !== "done" ? "waiting" : at >= 2 ? (book.status === "story_review" ? "done" : st(Math.min(at, 3))) : "waiting", detail: at >= 2 && book.status !== "story_review" ? "under a minute" : undefined },
      { id: "ready", label: "Ready for you to read", state: book.status === "story_review" ? "done" : "waiting" },
    ] as BookProgress["steps"];
    const percent = book.status === "story_review" ? 100 : Math.round(((outline === "done" ? 1 : 0.15) + at * 0.85) / 4.5 * 100);
    return {
      steps,
      illustrations: { done: 0, failed: 0, total: 0 },
      failedJobs: jobs.filter((j) => j.status === "failed").length,
      costUsd: Math.round(jobs.reduce((s2, j) => s2 + j.costUsd, 0) * 10000) / 10000,
      percent: Math.min(97, percent),
      problems: opts.withProblems ? groupProblems(jobs.filter((j) => j.status === "failed" && j.error).map((j) => j.error!)) : undefined,
      phase: "story",
      premise,
    };
  }
  const total = pages.length;
  const done = pages.filter((p) => p.imageStatus === "ready").length;
  const failed = pages.filter((p) => p.imageStatus === "failed").length;
  const art: StepState = total === 0 ? "waiting" : done + failed === total ? (failed ? "failed" : "done") : "working";
  const retrying = jobs.find((j) => j.status === "queued" && j.error);
  const steps = [
    { id: "outline", label: "Planning the story", state: outline },
    { id: "pages", label: "Writing every page", state: text },
    { id: "art", label: "Painting the pictures", state: art, detail: total ? `${done} of ${total}${failed ? `, ${failed} need another try` : ""}` : undefined },
    { id: "cover", label: "Making the cover", state: cover },
  ];
  const planning = jobs.some((j) => j.type === "book.artdirect" && (j.status === "queued" || j.status === "running"));
  if (planning && art === "working") steps[2].detail = "Planning each picture from your story...";
  const overnight = jobs.some((j) => (j.type === "book.batch" || j.type === "book.batch.poll") && (j.status === "queued" || j.status === "running"));
  if (overnight) steps[2].detail = "Overnight: usually a few hours, always within a day";
  if (retrying) steps[steps.findIndex((s) => s.state === "working") >= 0 ? steps.findIndex((s) => s.state === "working") : 0].detail = "Hit a snag, retrying automatically...";
  const units = 2 + Math.max(total, expectedStoryPages) + 1;
  const finished = (outline === "done" ? 1 : 0) + (text === "done" ? 1 : 0) + done + failed + (cover === "done" || cover === "failed" ? 1 : 0);
  return {
    steps,
    illustrations: { done, failed, total },
    failedJobs: jobs.filter((j) => j.status === "failed").length,
    overnight,
    phase: "pictures",
    premise,
    costUsd: Math.round(jobs.reduce((s, j) => s + j.costUsd, 0) * 10000) / 10000,
    percent: Math.round((finished / Math.max(units, 1)) * 100),
    problems: opts.withProblems ? groupProblems(jobs.filter((j) => j.status === "failed" && j.error).map((j) => j.error!)) : undefined,
  };
}

function groupProblems(errors: string[]) {
  const groups = new Map<string, { count: number; detail: string }>();
  for (const e of errors) {
    const detail = e.replace(/\s+/g, " ").slice(0, 300);
    const key = detail.slice(0, 80);
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { count: 1, detail });
  }
  return [...groups.values()].map((g) => ({ ...g, hint: explainFailure(g.detail) })).sort((a, b) => b.count - a.count).slice(0, 4);
}
