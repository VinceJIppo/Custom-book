import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import type { LegalPage as Page, LegalSection } from "@/lib/legal/types";

/** Plain text with [words](/path) links (site paths only). */
function Rich({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[a-z0-9/#-]*)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(
      <Link key={m.index} href={m[2]} className="ss-link">
        {m[1]}
      </Link>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function Body({ s }: { s: LegalSection }) {
  return (
    <>
      {s.paragraphs.map((p, i) => (
        <p key={i}>
          <Rich text={p} />
        </p>
      ))}
      {s.bullets.length > 0 && (
        <ul className="list-disc space-y-1 pl-5">
          {s.bullets.map((b, i) => (
            <li key={i}>
              <Rich text={b} />
            </li>
          ))}
        </ul>
      )}
      {s.table && (
        // Phones: one small card per row, every column labeled, so nothing hides off-screen.
        <ul className="m-0 list-none space-y-3 p-0 sm:hidden" data-testid="legal-table-cards">
          {s.table.rows.map((r, i) => (
            <li key={i} className="ss-card ss-card--sunk body-s space-y-1 p-4">
              <p className="m-0 font-semibold">{r[0]}</p>
              {r.slice(1).map((cell, j) => (
                <p key={j} className="m-0">
                  <span className="text-ink-muted">{s.table!.columns[j + 1]}: </span>
                  <Rich text={cell} />
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
      {s.table && (
        <div className="ss-card ss-card--sunk hidden overflow-x-auto p-0 sm:block">
          <table className="body-s w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr>
                {s.table.columns.map((c) => (
                  <th key={c} scope="col" className="border-b border-line px-4 py-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.table.rows.map((r, i) => (
                <tr key={i} className="align-top">
                  {r.map((cell, j) =>
                    j === 0 ? (
                      <th key={j} scope="row" className="border-b border-line px-4 py-3 font-semibold">
                        {cell}
                      </th>
                    ) : (
                      <td key={j} className="border-b border-line px-4 py-3">
                        <Rich text={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** A long help or legal page: header, "The short version", a contents list and numbered sections. */
export function LegalPage({ page, eyebrow }: { page: Page; eyebrow: string }) {
  return (
    <article className="mx-auto max-w-3xl space-y-10 text-[17px] leading-[26px]" data-testid="legal-page">
      <header className="space-y-3">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display-l break-words">{page.title}</h1>
        <p className="text-ink-muted">
          <Rich text={page.lede} />
        </p>
      </header>

      {page.short.length > 0 && (
        <section className="ss-card ss-card--piped space-y-3" aria-labelledby="short-version">
          <h2 id="short-version" className="title">
            The short version
          </h2>
          <ul className="list-disc space-y-2 pl-5">
            {page.short.map((b, i) => (
              <li key={i}>
                <Rich text={b} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {page.sections.length > 6 && (
        <nav aria-label="On this page" className="body-s">
          <p className="label">On this page</p>
          <ol className="mt-2 grid list-none gap-x-6 gap-y-1 p-0 sm:grid-cols-2">
            {page.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="ss-link">
                  {s.heading}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      {page.sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-6 space-y-3">
          <h2 className="title">{s.heading}</h2>
          <Body s={s} />
          {s.sub?.map((x) => (
            <Fragment key={x.id}>
              <h3 id={x.id} className="mt-5 scroll-mt-6 font-semibold">
                {x.heading}
              </h3>
              <Body s={x} />
            </Fragment>
          ))}
        </section>
      ))}
    </article>
  );
}
