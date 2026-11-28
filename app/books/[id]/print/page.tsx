import { isAdminEmail } from "@/lib/admin";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOnboardedUser } from "@/lib/session";
import { getBookForUser } from "@/lib/books/service";
import { buildBookView } from "@/lib/books/view";
import { listExports, preflightOf, productsForBook } from "@/lib/books/export";
import { getStorage } from "@/lib/storage";
import { activeProviderNames } from "@/lib/providers/registry";
import { ExportForm } from "@/components/ExportForm";
import { AutoRefresh } from "@/components/AutoRefresh";
import { validateExportAction } from "@/app/actions";
import type { FileValidation } from "@/lib/providers/print/types";
import { Star } from "@/components/brand/Star";

export const dynamic = "force-dynamic";

const ICON = { error: "✕", warning: "!", pass: "✓" } as const;
const COLOR = { error: "text-persimmon", warning: "text-ink", pass: "text-delft" } as const;

/** Rounded line download icon (1.75px stroke, currentColor), decorative. */
function DownloadIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className="shrink-0">
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  );
}

function slug(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "book";
}

export default async function PrintFiles({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  const sp = await searchParams;
  const products = await productsForBook(book.trimSize, { offeredOnly: !isAdminEmail(user.email) });
  const exports = await listExports(user.id, book.id);
  const storage = getStorage();
  const currentKey = book.pages.length ? (await buildBookView(book)).contentKey : "";
  const providerName = activeProviderNames().print;
  const busy = exports.some((e) => e.status === "rendering" || e.validationStatus === "running");
  const notReady = book.status !== "ready" ? "The book is still being made." : book.pages.some((p) => p.imageStatus === "pending") ? "A picture is still being drawn." : undefined;

  const rows = await Promise.all(
    exports.map(async (e) => {
      const name = slug(book.title ?? "book");
      return {
        e,
        report: preflightOf(e),
        interiorUrl: e.interiorKey ? await storage.signedUrl(e.interiorKey, 600, { downloadName: `${name}-interior.pdf` }) : null,
        coverUrl: e.coverKey ? await storage.signedUrl(e.coverKey, 600, { downloadName: `${name}-cover.pdf` }) : null,
        product: products.find((p) => p.id === e.productId),
        stale: e.contentKey !== currentKey,
        validation: e.validation as unknown as FileValidation | null,
        dims: e.coverDims as { widthIn: number; heightIn: number; spineIn: number; approximate?: boolean } | null,
      };
    }),
  );

  return (
    <div className="space-y-6">
      <AutoRefresh active={busy} everyMs={2500} />
      <Link href={`/books/${book.id}`} className="ss-link body-s inline-flex min-h-11 items-center">
        ← Back to the book
      </Link>
      <div className="min-w-0">
        <h1 className="heading break-words">Print files for {book.title}</h1>
        <p className="mt-2 text-ink-muted">
          We make two PDFs a printer needs: the interior (every page, with bleed) and the wraparound cover. Then we check them against the printer&apos;s rules.
          {providerName === "mock" && " Printer: offline mock (add Lulu sandbox keys to check files with Lulu)."}
        </p>
      </div>
      {sp.error && (
        <p className="ss-note ss-note--error" role="alert">
          {sp.error}
        </p>
      )}

      <section className="ss-card ss-card--piped">
        <h2 className="title mb-4">1. Choose the book type</h2>
        <ExportForm
          bookId={book.id}
          products={products.map((p) => ({ id: p.id, label: p.label, detail: `${p.paper} · ${p.pageRules.minPages} to ${p.pageRules.maxPages} pages` }))}
          disabled={notReady}
        />
      </section>

      {rows.map(({ e, report, interiorUrl, coverUrl, product, stale, validation, dims }) => (
        <section key={e.id} className="ss-card min-w-0 space-y-4" data-testid="export">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="title min-w-0">{product?.label ?? e.productId}</h2>
            <span className="body-s min-w-0 wrap-anywhere text-ink-muted">
              {e.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              {isAdminEmail(user.email) && ` · printer code ${e.sku}`}
            </span>
          </div>
          {stale && e.status === "ready" && <p className="ss-note ss-note--warn">The book changed after these files were made. Make new files before ordering.</p>}
          {e.status === "rendering" && <p className="animate-pulse text-delft">Making the PDFs. This takes about a minute...</p>}
          {e.status === "failed" && <p className="ss-note ss-note--error">Making the files failed: {e.error}</p>}

          {e.status === "ready" && (
            <>
              {e.preflightOk && !stale && e.validationStatus !== "failed" && (
                <Link href={`/books/${book.id}/order`} className="ss-btn ss-btn--secondary" data-testid="order-from-print">
                  <Star className="h-3.5 w-3.5 text-persimmon" />
                  Order a printed copy
                </Link>
              )}
              <div className="flex flex-wrap gap-3">
                {interiorUrl && (
                  <a href={interiorUrl} className="ss-btn ss-btn--secondary ss-btn--sm h-auto min-h-11 max-w-full py-2 text-center" data-testid="download-interior">
                    <DownloadIcon />
                    Interior PDF ({e.pageCount} pages)
                  </a>
                )}
                {coverUrl && (
                  <a href={coverUrl} className="ss-btn ss-btn--secondary ss-btn--sm h-auto min-h-11 max-w-full py-2 text-center" data-testid="download-cover">
                    <DownloadIcon />
                    Cover PDF{dims ? ` (${dims.widthIn} x ${dims.heightIn} in, spine ${dims.spineIn} in)` : ""}
                  </a>
                )}
              </div>

              {report && (
                <div>
                  <p className={`font-semibold ${report.ok ? "text-delft" : "text-persimmon"}`} data-testid="preflight-summary">
                    Preflight: {report.ok ? "ready to print" : `${report.errors} problem(s) to fix`}
                    {report.warnings > 0 && `, ${report.warnings} warning(s)`}
                  </p>
                  <ul className="body-s mt-2 space-y-1" data-testid="preflight">
                    {report.items.map((it, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={`w-4 shrink-0 font-bold ${COLOR[it.level]}`} aria-label={it.level}>
                          {ICON[it.level]}
                        </span>
                        <span className="min-w-0 break-words">
                          {it.message}
                          {it.page && it.level !== "pass" && (
                            <>
                              {" "}
                              <Link href={`/books/${book.id}/edit`} className="ss-link">
                                Fix
                              </Link>
                            </>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="ss-card ss-card--sunk">
                <h3 className="title">2. Check with the printer</h3>
                {e.provider === "mock" && <p className="body-s text-ink-muted">Test printer: nothing is sent anywhere.</p>}
                {e.validationStatus === "none" && (
                  <form action={validateExportAction} className="mt-3 flex flex-wrap items-center gap-3">
                    <input type="hidden" name="bookId" value={book.id} />
                    <input type="hidden" name="exportId" value={e.id} />
                    <button disabled={!e.preflightOk} className="ss-btn ss-btn--secondary" data-testid="validate">
                      {e.provider === "lulu" ? "Validate with Lulu" : "Run printer check"}
                    </button>
                    {!e.preflightOk && <span className="body-s text-ink-muted">Fix the preflight problems first.</span>}
                  </form>
                )}
                {e.validationStatus === "running" && <p className="mt-2 animate-pulse text-delft">{e.validationProgress ?? "Checking..."} (Lulu can take a few minutes)</p>}
                {e.validationStatus === "passed" && (
                  <p className="ss-note ss-note--success mt-3" data-testid="validation-passed">
                    ✓ Passed. Interior: {validation?.interior?.status ?? "ok"}. Cover: {validation?.cover?.status ?? "ok"}.
                  </p>
                )}
                {e.validationStatus === "failed" && (
                  <div className="ss-note ss-note--error mt-3">
                    <p>✕ The printer found problems:</p>
                    <ul className="list-disc pl-5">
                      {(validation?.problems?.length ? validation.problems : [e.error ?? "Unknown problem"]).map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
