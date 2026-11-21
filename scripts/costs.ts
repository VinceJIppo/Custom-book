/**
 * What a book's generation actually did, job by job: attempts, errors, time
 * taken, recorded spend, and an estimate of how many paid image calls each
 * picture really made (including ones the app didn't record).
 *
 *   npm run costs                 the most recent book
 *   npm run costs -- <bookId>     a specific book (the id is in the book's address: /books/<bookId>)
 *   npm run costs -- --list       recent books with their recorded spend
 */
import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import("../lib/db");
  const { getConfig } = await import("../lib/config");
  const arg = process.argv[2];

  if (arg === "--list") {
    const books = await db.book.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: { jobs: { select: { costUsd: true } } },
    });
    for (const b of books) {
      const spent = b.jobs.reduce((s, j) => s + j.costUsd, 0);
      console.log(
        `${b.id}  ${b.createdAt.toLocaleString().padEnd(22)}  ${b.status.padEnd(10)}  $${spent.toFixed(2).padStart(6)}  ${b.title ?? "(untitled)"}`,
      );
    }
    return;
  }

  const book = arg
    ? await db.book.findUnique({ where: { id: arg } })
    : await db.book.findFirst({ orderBy: { createdAt: "desc" } });
  if (!book) throw new Error(arg ? `No book with id ${arg}` : "No books yet");
  const cfg = getConfig();
  const leaseSec = cfg.JOB_LEASE_SECONDS;
  const jobs = await db.generationJob.findMany({
    where: { bookId: book.id },
    orderBy: { createdAt: "asc" },
  });
  const pages = await db.page.findMany({
    where: { bookId: book.id },
    select: { id: true, storyNumber: true },
  });
  const pageLabel = (id: string | null) => {
    const p = pages.find((x) => x.id === id);
    return p?.storyNumber ? `page ${p.storyNumber}` : "";
  };

  console.log(`\n${book.title ?? "(untitled)"}  (${book.id})`);
  console.log(
    `Created ${book.createdAt.toLocaleString()} · status ${book.status} · style ${book.style}`,
  );
  console.log(
    `Settings now: GEMINI_PAGE_SIZE=${cfg.GEMINI_PAGE_SIZE}, WORKER_CONCURRENCY=${cfg.WORKER_CONCURRENCY}, JOB_LEASE_SECONDS=${leaseSec}, CONSISTENCY_QA=${cfg.CONSISTENCY_QA}\n`,
  );

  let recorded = 0;
  let recordedImageCalls = 0;
  let estimatedImageCalls = 0;
  const findings = new Set<string>();
  console.log(
    "Job              Where     Status     Tries  Took    Recorded  Images(rec/est)  Error",
  );
  for (const j of jobs) {
    const usage = (j.usage ?? {}) as {
      imageCalls?: number;
      earlierDraws?: number;
      drawsCounted?: boolean;
    };
    const imgRec = (usage.imageCalls ?? 0) + (usage.earlierDraws ?? 0);
    // Jobs made after the draw-count fix record every picture exactly (failed tries too).
    const exact = "drawsCounted" in usage;
    const isImageJob =
      j.type === "page.illustrate" ||
      j.type === "page.edit" ||
      j.type === "book.cover" ||
      j.type === "character.sheet";
    const took =
      j.startedAt && (j.finishedAt ?? j.updatedAt)
        ? Math.round(
            ((j.finishedAt ?? j.updatedAt).getTime() - j.startedAt.getTime()) /
              1000,
          )
        : null;
    const err = j.error ?? "";
    // Refused before drawing (out of Gemini credits, rate-limited, bad key): nothing billed.
    const refusedBeforeDrawing =
      /HTTP 40[123]|HTTP 429|prepayment credits/i.test(err) && (took ?? 0) < 10;
    // Older jobs: each try that got past drawing paid for one picture.
    const est = !isImageJob
      ? 0
      : exact || refusedBeforeDrawing
        ? imgRec
        : Math.max(imgRec, j.attempts);
    recorded += j.costUsd;
    recordedImageCalls += imgRec;
    estimatedImageCalls += est;
    if (j.attempts > 1 && !j.error && took != null && took > leaseSec)
      findings.add(
        `Some jobs ran more than once without an error: they took longer than JOB_LEASE_SECONDS (${leaseSec}s), so the worker started a second copy while the first was still running. Both were billed.`,
      );
    if (j.attempts > 1 && j.error && isImageJob && !refusedBeforeDrawing)
      findings.add(
        "Some picture jobs failed after drawing and were retried; each retry paid for a new picture.",
      );
    if (/credit balance is too low/i.test(err))
      findings.add(
        "Claude (Anthropic) ran out of credits. The picture check runs AFTER Gemini draws, so each of those tries paid Gemini for a picture that was then thrown away.",
      );
    if (/prepayment credits|HTTP 402/i.test(err))
      findings.add(
        "Gemini ran out of prepaid credits. Those tries were refused before drawing, so they cost nothing.",
      );
    if (/fetch failed/i.test(err))
      findings.add(
        '"fetch failed" is a dropped network connection. A try is billed only if the drop came after Gemini finished drawing.',
      );
    if (took != null && took > leaseSec)
      findings.add(
        `Some jobs took over ${leaseSec}s (the lease), which lets a second copy start.`,
      );
    if (j.status === "failed" && imgRec === 0 && isImageJob)
      findings.add(
        "Failed picture jobs recorded $0, but their attempts were still billed by Gemini if a picture was drawn before the failure.",
      );
    console.log(
      `${j.type.padEnd(16)} ${pageLabel(j.pageId).padEnd(9)} ${j.status.padEnd(10)} ${String(j.attempts).padStart(5)}  ${took == null ? "   -  " : `${String(took).padStart(4)}s `} $${j.costUsd.toFixed(3).padStart(7)}  ${String(imgRec).padStart(5)}/${String(est).padEnd(9)} ${(j.error ?? "").replace(/\s+/g, " ").slice(0, 110)}`,
    );
  }
  // Character sets aren't tied to a book, so show the rest of that day's image work too.
  const dayStart = new Date(book.createdAt);
  dayStart.setHours(0, 0, 0, 0);
  const otherJobs = await db.generationJob.findMany({
    where: {
      userId: book.userId,
      createdAt: {
        gte: dayStart,
        lt: new Date(dayStart.getTime() + 86400_000),
      },
      OR: [{ bookId: null }, { bookId: { not: book.id } }],
    },
  });
  const sheets = otherJobs.filter((j) => j.type === "character.sheet");
  const sheetPics = sheets.reduce(
    (n, j) =>
      n +
      Math.max(
        Number((j.usage as { imageCalls?: number } | null)?.imageCalls ?? 0),
        j.status === "succeeded" ? 3 : 0,
      ),
    0,
  );
  const otherBooks = new Set(otherJobs.map((j) => j.bookId).filter(Boolean));
  const otherPics = otherJobs.filter(
    (j) => j.bookId && /illustrate|edit|cover/.test(j.type),
  ).length;
  console.log(
    `\nSame day, outside this book: ${sheets.length} character set job(s) (about ${sheetPics} pictures), ${otherBooks.size} other book(s) with ${otherPics} picture job(s); recorded $${otherJobs.reduce((s, j) => s + j.costUsd, 0).toFixed(2)}.`,
  );
  const perImage =
    { "1K": 0.034, "2K": 0.05, "4K": 0.113, auto: 0.113 }[
      cfg.GEMINI_PAGE_SIZE
    ] ?? 0.113;
  console.log(
    `\nRecorded spend: $${recorded.toFixed(2)} with ${recordedImageCalls} image call(s) recorded.`,
  );
  console.log(
    `Estimated image calls actually made: about ${estimatedImageCalls} (roughly $${(estimatedImageCalls * perImage).toFixed(2)} of Gemini at up to $${perImage}/picture).`,
  );
  if (findings.size) {
    console.log("\nWhat happened:");
    for (const f of findings) console.log(`- ${f}`);
  }
  console.log(
    "\nCompare with Google's numbers: https://aistudio.google.com/spend and https://aistudio.google.com/usage",
  );
  await db.$disconnect();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
