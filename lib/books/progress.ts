import { db } from "../db";

export type StepState = "waiting" | "working" | "done" | "failed";

export interface BookProgress {
  steps: Array<{ id: string; label: string; state: StepState; detail?: string }>;
  illustrations: { done: number; failed: number; total: number };
  failedJobs: number;
  costUsd: number;
  percent: number;
}

function stateOf(jobs: Array<{ status: string }>): StepState {
  if (!jobs.length) return "waiting";
  if (jobs.some((j) => j.status === "succeeded")) return "done";
  if (jobs.every((j) => j.status === "failed")) return "failed";
  if (jobs.some((j) => j.status === "running")) return "working";
  return "working";
}

/** Plain-English progress for the live progress panel. */
export async function getBookProgress(bookId: string, expectedStoryPages: number): Promise<BookProgress> {
  const [jobs, pages] = await Promise.all([
    db.generationJob.findMany({ where: { bookId }, select: { type: true, status: true, costUsd: true, error: true, attempts: true, maxAttempts: true } }),
    db.page.findMany({ where: { bookId, kind: "story" }, select: { imageStatus: true } }),
  ]);
  const of = (t: string) => jobs.filter((j) => j.type === t);
  const outline = stateOf(of("book.outline"));
  const text = stateOf(of("book.pages"));
  const cover = stateOf(of("book.cover"));
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
  if (retrying) steps[steps.findIndex((s) => s.state === "working") >= 0 ? steps.findIndex((s) => s.state === "working") : 0].detail = "Hit a snag, retrying automatically...";
  const units = 2 + Math.max(total, expectedStoryPages) + 1;
  const finished = (outline === "done" ? 1 : 0) + (text === "done" ? 1 : 0) + done + failed + (cover === "done" || cover === "failed" ? 1 : 0);
  return {
    steps,
    illustrations: { done, failed, total },
    failedJobs: jobs.filter((j) => j.status === "failed").length,
    costUsd: Math.round(jobs.reduce((s, j) => s + j.costUsd, 0) * 10000) / 10000,
    percent: Math.round((finished / Math.max(units, 1)) * 100),
  };
}
