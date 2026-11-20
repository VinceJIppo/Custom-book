# StoryStar

Personalized picture books where your child is the hero. A parent creates a child
profile, picks a theme, and gets an illustrated book to read as an animated flipbook,
export as print-ready PDFs, and (later) order as a printed hardcover.

**Status: Phase 1 (foundation with mocks).** Runs end to end with zero API keys.

## Quick start

Requires Node 22+.

```bash
npm install
npm run setup                   # creates .env.local from .env.example if missing,
                                # the SQLite DB, and seeds the 6 built-in themes
npm run dev                     # web on http://localhost:3000 plus the background worker
```

`npm run dev` starts two processes: the Next.js app and the job worker
(`scripts/worker.ts`). Generation only progresses while the worker runs.

To write stories with Claude, put `ANTHROPIC_API_KEY=...` in `.env.local` and restart.
See [PROVIDERS.md](PROVIDERS.md) for exactly what is sent and what it costs.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web + worker with reload |
| `npm run worker` | Worker only |
| `npm run setup` | `db:push` + `db:seed` |
| `npm test` | Unit and integration tests (Vitest, uses `prisma/.data/test.db`) |
| `npm run test:e2e` | Browser tests (Playwright, desktop and phone); starts `npm run dev` if needed |
| `npm run lint` / `npm run typecheck` | ESLint (includes the provider-import rule) / TypeScript |
| `npm run db:studio` | Browse the dev database |

## How it fits together

```
Browser ── Next.js App Router (server actions, API routes)
              │  creates rows + queues jobs, reads progress
              ▼
          SQLite / Postgres (Prisma) ◄── Worker (scripts/worker.ts)
              ▲                            │ claims jobs, retries with backoff
              │                            ▼
          Storage (encrypted, signed URLs)  Providers (lib/providers/*): Story, Image,
                                            Upscaler, Moderation, Print (+ PrintRouter)
```

- **Generation pipeline** (`lib/jobs/handlers`): `book.outline` → `book.pages` → one
  `page.illustrate` per story page + `book.cover`. Each page is its own job, so a single
  page can be redone without touching the rest. Jobs survive refreshes and restarts; a
  job whose worker dies is reclaimed when its lease expires.
- **Themes are data** (`themes/*.json`, validated by `lib/schemas/theme.ts`). Each book
  freezes a copy of its theme and child details, so later edits never change it.
- **One layout source for screen and print** (`components/book/BookPage.tsx`). Pages are
  laid out in physical inches using CSS container units; the flipbook scales them, and
  `/print/[bookId]` renders them at exact size with bleed (the Phase 3 PDF source).
- **Print geometry** (`lib/print/geometry.ts`, `padding.ts`, `lib/books/paginate.ts`):
  bleed, safe area, gutter, 300 ppi targets, spreads on facing pages, and padding to the
  product's page rules with designed pages.

## Safety and privacy (implemented so far)

- Adults only (age confirmation), single-user mode until Auth.js in Phase 2.
- Protected-names check (`lib/safety/protected-names.json`) on favorites, lessons,
  dedications and instructions, with original-theme suggestions. Child, pet and friend
  names are never checked (a real child can be called Elsa).
- Moderation check on all parent free text (mock word list for now).
- All files encrypted at rest (AES-256-GCM) and served only via short-lived HMAC-signed URLs.
- "Delete this child and everything about them" removes their files and all DB rows.
- Logs strip image data and base64 (`lib/log.ts`).
- Daily cost and book caps; a cost estimate is shown before every book.

## Project layout

```
app/                  pages, server actions, API routes (/api/files, /api/books/[id]/status)
components/           ChildForm, BookWizard, BookLive, book/BookPage, flipbook/Flipbook
lib/providers/        interfaces + mock/real adapters, registry
lib/jobs/             queue, runner, handlers
lib/schemas/          Zod schemas (theme, child, book, story)
lib/print/            geometry and page-count padding
lib/books/            services, pagination, view model, progress
lib/storage/          local encrypted driver, S3 stub
lib/safety/           protected names
lib/cost/             prices and estimates
prisma/               schema and seed
themes/               built-in theme JSON
tests/, e2e/          Vitest and Playwright
```
