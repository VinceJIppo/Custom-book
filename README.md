# StoryStar

Personalized picture books where your child is the hero. A parent creates a child
profile, picks a theme, and gets an illustrated book to read as an animated flipbook,
export as print-ready PDFs, and (later) order as a printed hardcover.

**Status: Phase 3 (print-ready export).** Runs end to end with zero API keys;
add keys to draw real characters, write real stories, and check files with Lulu.

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

Keys (all optional) go in `.env.local`; restart after changing it:

- `ANTHROPIC_API_KEY`: Claude writes the stories, checks photos and likeness, moderates text, drafts themes.
- `GEMINI_API_KEY`: Gemini draws the character and every page (the default image provider).
- `OPENAI_API_KEY`: OpenAI as an alternative image provider (or to compare against Gemini).
- `LULU_CLIENT_KEY` and `LULU_CLIENT_SECRET`: Lulu sandbox keys, to get exact cover sizes and have
  Lulu validate the print files.

The PDF renderer uses headless Chromium. Install it once with `npx playwright install chromium`.

See [PROVIDERS.md](PROVIDERS.md) for exactly what is sent where and what it costs.

## The flow

1. Add a child (name, age, favorites, pet, friends, lesson).
2. **Photos & character:** upload 1 to 3 photos (JPG, PNG or HEIC). Location data is stripped and
   each photo is checked for one clear face. Pick an art style; we draw 3 character options.
   Approve one (originals are deleted by default), then correct the Character Bible if needed.
3. **New book:** pick a built-in or custom theme and options. Every page is drawn from the
   approved character, checked for likeness, redrawn once on drift, and flagged if it still drifts.
4. **Read** in the flipbook. **Edit pages:** change text (or ask for a rewrite), change or redraw
   one picture with a note, swap layout, reorder, restore any earlier version.
5. **Themes:** describe what your child loves and get an editable original theme; duplicate any theme.
6. **Print files:** choose hardcover or softcover. We render the interior and wraparound cover PDFs,
   run preflight (sizes, bleed, safe area, text fit, image resolution, fonts, transparency, page
   count, cover size, spine), and offer downloads. Then "Validate with Lulu" sends the files to Lulu.

### Validating with Lulu from your own computer

Lulu downloads the PDFs from a public link, and `localhost` isn't public. Use a temporary tunnel:

1. Put your Lulu **sandbox** keys in `.env.local`.
2. In a second terminal, run `npx cloudflared tunnel --url http://localhost:3000` and copy the
   `https://....trycloudflare.com` address it prints.
3. Set `PUBLIC_BASE_URL=` to that address in `.env.local`, restart `npm run dev`, and use
   **Validate with Lulu**. Through that address the app serves only signed PDF links; every other
   page answers 404, so your book and photos stay private. Stop the tunnel (Ctrl+C) when done.

`npm run lulu:check` tests your keys (it prints cover sizes for each product), and
`npm run lulu:check -- <exportId>` validates one set of files from the command line.

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
| `npm run compare -- --a gemini --b openai --character sheet.png` | Same 4 scenes from 2 image providers, side by side |
| `npm run render:pdfs -- <bookId> [productId]` | Render a book's print PDFs and preflight from the command line (to `exports/`) |
| `npm run lulu:check [-- <exportId>]` | Check Lulu keys and cover sizes; optionally validate an export with Lulu |

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

- Adults only (age confirmation); single-user mode (Auth.js sign-in is still to come).
- Guardian consent checkbox before the first photo upload. Photos are re-encoded with all
  metadata (including GPS) removed, stored encrypted, used only for the character sheet,
  and deleted after approval by default. Gemini requests are sent with `store: false`.
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
lib/providers/        interfaces, mocks, registry; vendor folders anthropic/, gemini/, openai/
lib/jobs/             queue, runner, handlers
lib/schemas/          Zod schemas (theme, child, book, story)
lib/print/            geometry, padding, products (Lulu SKUs), cover layout, PDF renderer, PDF inspector, preflight
lib/books/            services, pagination, view model, progress
lib/storage/          local encrypted driver, S3 stub
lib/characters/       photos, character sheets, Character Bible
lib/images/           photo intake (HEIC, rotation, metadata stripping), references
lib/customThemes.ts   Custom Theme Builder
lib/safety/           protected names
lib/cost/             prices and estimates
prisma/               schema and seed
themes/               built-in theme JSON
tests/, e2e/          Vitest and Playwright
```
