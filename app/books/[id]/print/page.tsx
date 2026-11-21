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

export const dynamic = "force-dynamic";

const ICON = { error: "✕", warning: "!", pass: "✓" } as const;
const COLOR = { error: "text-red-700", warning: "text-amber-700", pass: "text-emerald-700" } as const;

function slug(s: string) {
  return s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "book";
}

export default async function PrintFiles({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireOnboardedUser();
  const book = await getBookForUser(user.id, (await params).id);
  if (!book) notFound();
  const sp = await searchParams;
  const products = await productsForBook(book.trimSize);
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
      <Link href={`/books/${book.id}`} className="text-sm font-semibold text-cobalt">
        ← Back to the book
      </Link>
      <div>
        <h1 className="font-display text-3xl font-medium">Print files for {book.title}</h1>
        <p className="text-[color:var(--muted)]">
          We make two PDFs a printer needs: the interior (every page, with bleed) and the wraparound cover. Then we check them against the printer&apos;s rules.
          {providerName === "mock" && " Printer: offline mock (add Lulu sandbox keys to check files with Lulu)."}
        </p>
      </div>
      {sp.error && <p className="rounded-xl bg-amber-50 px-4 py-3 text-amber-900 ring-1 ring-amber-200">{sp.error}</p>}

      <section className="rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]">
        <h2 className="mb-3 font-display text-xl font-medium">1. Choose the book type</h2>
        <ExportForm
          bookId={book.id}
          products={products.map((p) => ({ id: p.id, label: p.label, detail: `${p.paper} · ${p.pageRules.minPages} to ${p.pageRules.maxPages} pages` }))}
          disabled={notReady}
        />
      </section>

      {rows.map(({ e, report, interiorUrl, coverUrl, product, stale, validation, dims }) => (
        <section key={e.id} className="space-y-4 rounded-xl bg-white p-5 ring-1 ring-[color:var(--line)]" data-testid="export">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-medium">{product?.label ?? e.productId}</h2>
            <span className="text-sm text-[color:var(--muted)]">
              {e.createdAt.toLocaleString()} · {e.sku}
            </span>
          </div>
          {stale && e.status === "ready" && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200">The book changed after these files were made. Make new files before ordering.</p>}
          {e.status === "rendering" && <p className="animate-pulse text-cobalt">Making the PDFs. This takes about a minute...</p>}
          {e.status === "failed" && <p className="text-red-700">Making the files failed: {e.error}</p>}

          {e.status === "ready" && (
            <>
              {e.preflightOk && !stale && e.validationStatus !== "failed" && (
                <Link href={`/books/${book.id}/order`} className="btn btn-primary" data-testid="order-from-print">
                  Order a printed copy
                </Link>
              )}
              <div className="flex flex-wrap gap-3">
                {interiorUrl && (
                  <a href={interiorUrl} className="btn btn-primary" data-testid="download-interior">
                    ⬇ Interior PDF ({e.pageCount} pages)
                  </a>
                )}
                {coverUrl && (
                  <a href={coverUrl} className="btn btn-primary" data-testid="download-cover">
                    ⬇ Cover PDF{dims ? ` (${dims.widthIn} x ${dims.heightIn} in, spine ${dims.spineIn} in)` : ""}
                  </a>
                )}
              </div>

              {report && (
                <div>
                  <p className={`font-semibold ${report.ok ? "text-emerald-700" : "text-red-700"}`} data-testid="preflight-summary">
                    Preflight: {report.ok ? "ready to print" : `${report.errors} problem(s) to fix`}
                    {report.warnings > 0 && `, ${report.warnings} warning(s)`}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm" data-testid="preflight">
                    {report.items.map((it, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={`w-4 shrink-0 font-bold ${COLOR[it.level]}`} aria-label={it.level}>
                          {ICON[it.level]}
                        </span>
                        <span>
                          {it.message}
                          {it.page && it.level !== "pass" && (
                            <>
                              {" "}
                              <Link href={`/books/${book.id}/edit`} className="text-cobalt underline">
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

              <div className="rounded-lg bg-cream p-4">
                <p className="font-semibold">2. Check with the printer ({e.provider === "mock" ? "mock" : e.provider})</p>
                {e.validationStatus === "none" && (
                  <form action={validateExportAction} className="mt-2">
                    <input type="hidden" name="bookId" value={book.id} />
                    <input type="hidden" name="exportId" value={e.id} />
                    <button disabled={!e.preflightOk} className="btn btn-secondary" data-testid="validate">
                      {e.provider === "lulu" ? "Validate with Lulu" : "Run printer check"}
                    </button>
                    {!e.preflightOk && <span className="ml-3 text-sm text-[color:var(--muted)]">Fix the preflight problems first.</span>}
                  </form>
                )}
                {e.validationStatus === "running" && <p className="mt-2 animate-pulse text-cobalt">{e.validationProgress ?? "Checking..."} (Lulu can take a few minutes)</p>}
                {e.validationStatus === "passed" && (
                  <p className="mt-2 text-emerald-700" data-testid="validation-passed">
                    ✓ Passed. Interior: {validation?.interior?.status ?? "ok"}. Cover: {validation?.cover?.status ?? "ok"}.
                  </p>
                )}
                {e.validationStatus === "failed" && (
                  <div className="mt-2 text-red-700">
                    <p>✕ The printer found problems:</p>
                    <ul className="list-disc pl-5 text-sm">
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
