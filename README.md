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
3. **New book:** pick a built-in or custom theme, a **story voice**, and options. The story is
   planned, written, edited and art-directed (see "How stories are written"). Every page is drawn
   from the approved character with the whole-story summary, then checked twice: does the hero
   match the character, and does the picture show what the words say? A page that fails is redrawn
   once with the specific fix, and flagged for the parent if it still fails.
4. **Read** in the flipbook. **Edit pages:** change text (or ask for a rewrite), change or redraw
   one picture with a note, swap layout, reorder, restore any earlier version.
5. **Themes:** describe what your child loves and get an editable original theme; duplicate any theme.
6. **Print files:** choose hardcover or softcover. We render the interior and wraparound cover PDFs,
   run preflight (sizes, bleed, safe area, text fit, image resolution, fonts, transparency, page
   count, cover size, spine), and offer downloads. Then "Validate with Lulu" sends the files to Lulu.
7. **Order a printed copy:** pick the print files, enter any address (gift orders welcome) and see
   one total per shipping speed with delivery dates. Pay at checkout (Stripe in test mode, or an
   offline test checkout with no keys). After payment the app freezes a copy of the exact PDFs and
   creates the print job. Status updates (with the printer, printing, shipped with tracking,
   delivered, or rejected with the reason and a fix path) arrive by webhook, with polling as a
   fallback. **Orders** lists your orders; **/admin/orders** lists everyone's with the printer status.

## Accounts, sign-in and rewards (Phase 5)

- **Sign-in:** with `AUTH_MODE=email` (the default in production) parents sign in with an emailed
  magic link: no passwords. Links are one-time, expire in 15 minutes and are stored only as hashes;
  the link opens a "Sign in" button so email scanners can't use it up. Sessions are httpOnly
  cookies (30 days). On your own computer the default is `single` (no sign-in). To try sign-in
  locally, set `AUTH_MODE=email`; without `RESEND_API_KEY` the link appears on the page.
- **Email:** Resend (`RESEND_API_KEY`, `EMAIL_FROM` on a domain you verified in Resend).
- **Rewards:** making books costs real money, so allowances grow with printed orders:

  | Tier | How | New books | Character sets | Picture redraws | AI rewrites | Custom themes |
  |---|---|---|---|---|---|---|
  | Starter | first visit | 1 | 4 | 8 | 15 | 1 (to try, for life) |
  | Member | 1+ printed orders | 3 | 8 | 40 | 60 | 5 (every 30 days) |
  | Star | 3+ printed orders | 8 | 20 | 120 | 200 | 15 (every 30 days) |

  Failed generations and refunded orders don't count. Admins (`ADMIN_EMAILS`) are unlimited, and
  **/admin/users** sets a tier for family and friends or grants bonus books, characters and redraws.
  Blocked actions explain how to unlock more. The daily cost cap still applies as a safety net.

## Ordering (Phase 4)

How a test order flows:

```
Order form -> shipping options (printer price + your margin + card fee = one total per speed)
  -> checkout (Stripe test mode, or the offline test checkout) -> payment confirmed
  -> order "paid": exact PDFs frozen, print job queued (exactly once, even if the webhook and
     the return page both confirm the payment)
  -> worker creates the Lulu print job -> status by webhook (or polling every ORDER_POLL_MINUTES)
```

- **Prices** are always recalculated on the server from Lulu's cost API at checkout. The customer
  sees one total; the breakdown (printing, shipping, fulfillment, tax, your margin, card fee) is
  stored on the order and shown to admins. Set `ORDER_MARGIN_PERCENT` / `ORDER_MARGIN_FLAT_USD`
  for a margin; `ORDER_COVER_CARD_FEES=true` (default) adds Stripe's fee so it isn't your loss.
- **Addresses** are checked against the printer's rules (name 35 characters, street and city 30,
  a phone number, state codes where required) and Lulu's corrections are offered.
- **Rejected orders** show Lulu's reason and a fix path: make new print files, then "Send to the
  printer again" (no new charge). Admins can also check status, resend and refund.
- **Safety switch:** live Stripe keys (`sk_live_`) and Lulu production are refused unless
  `ALLOW_LIVE_ORDERS=true`.
- **Lulu sandbox payment:** a new Lulu print job waits as UNPAID until it's paid in the Lulu
  developer portal, unless a card is on file there (then it moves on by itself). The order page
  says so.

### Trying it with no keys

The mock printer and test checkout run everything offline: order a book, press **Pay (test)**,
and watch the status move from "With the printer" to "Printing", "Shipped" and "Delivered", one
step per `MOCK_PRINT_STEP_SECONDS` (60 by default; use **Check status now**). Ship to a recipient
named **Reject Test** to try the rejection and fix path.

### Trying it with Stripe test mode and the Lulu sandbox

1. Stripe: in the Stripe dashboard switch on **Test mode**, copy the secret key (`sk_test_...`) into
   `STRIPE_SECRET_KEY`. For webhooks on your own computer install the Stripe CLI and run
   `stripe listen --forward-to localhost:3000/api/webhooks/payment`; put the `whsec_...` it prints
   in `STRIPE_WEBHOOK_SECRET`. (Without webhooks the order is still confirmed when you return
   from checkout.) Pay with the test card `4242 4242 4242 4242`, any future date, any CVC.
2. Lulu: sandbox keys in `.env.local` and a tunnel in `PUBLIC_BASE_URL` (see below), so Lulu can
   download the PDFs. Then `npm run lulu:check -- --webhook` subscribes Lulu's status webhook to
   `/api/webhooks/print/lulu` on that address. `npm run lulu:check -- --quote 10001 NY` shows real
   prices for every shipping speed.
3. Restart `npm run dev`, make print files, and order.

### Validating with Lulu from your own computer

Lulu downloads the PDFs from a public link, and `localhost` isn't public. Use a temporary tunnel:

1. Put your Lulu **sandbox** keys in `.env.local`.
2. In a second terminal, run `npx cloudflared tunnel --url http://localhost:3000` and copy the
   `https://....trycloudflare.com` address it prints.
3. Set `PUBLIC_BASE_URL=` to that address in `.env.local`, restart `npm run dev`, and use
   **Validate with Lulu**. Through that address the app serves only signed PDF links; every other
   page answers 404, so your book and photos stay private. Stop the tunnel (Ctrl+C) when done.

`npm run lulu:check` tests your keys (it prints cover sizes for each product),
`npm run lulu:check -- <exportId>` validates one set of files from the command line,
`npm run lulu:check -- --quote 10001 NY` prints real prices, and `npm run lulu:check -- --webhook`
subscribes status webhooks for orders. The tunnel address also accepts the signed webhooks.

## How stories are written

A story is written like a real picture book, in stages (`lib/providers/anthropic/story.ts`):

1. **Story spine** (outline): the world rule and why the obvious fix fails, the problem and goal,
   attempts that fail for clear reasons, a turning point the child causes, the resolution, the
   lesson shown through a choice, setups with the page they pay off on, and continuity facts
   (for example "the whole town stays upside down until page 11"). Every page says how it follows
   from the one before. Outlines missing these are sent back.
2. **Manuscript:** the whole book in one go, so it reads as one story.
3. **Editor review:** a separate pass reads it like a parent and a five-year-old would, listing
   anything confusing (unexplained rules, objects from nowhere, actions that don't fit, like
   cheese for a drippy nose) and verse that is too long, off the beat or forced. If it finds
   problems, only the flagged pages are **rewritten**, the book is reviewed again, and a **final
   polish** fixes any notes left from the second review.

   Printed words never contain long dashes, and rhyming verse has a word limit per line (8 for
   ages 2 to 4, 10 for ages 4 to 6; `lib/schemas/storyText.ts`). Over-long lines get one redraft.
4. **Art direction:** for the final words, each page gets a scene, a **must-show** list phrased
   exactly as the words say ("the teapot hat on the Mayor's head"), and continuity notes, plus a
   short **story summary** that goes into every illustration prompt along with the page's words and
   what the pages before and after show. A picture may not show an object or character before the
   page whose words introduce it.

The editor's notes and the summary are saved on the book. About $0.80 to $1.10 of Claude per book (most of it is the model thinking).

### Story Lab: tune stories without making a book

```bash
npm run story:lab -- --theme topsy-turvy-town --name Oliver --age 5
npm run story:lab -- --theme space-explorer --name Mia --age 7 --voice adventure --length 16 --lesson "sharing" --runs 3
npm run story:lab -- --list
```

Runs the same story pipeline with no images and no database, and writes a readable file to
`story-lab/` (gitignored): the spine, the editor's notes, every page with its picture plan and
must-show list, and the summary. Use it to judge stories, tweak the prompts in
`lib/providers/anthropic/storyPrompts.ts` or the voices, and run again. Without an Anthropic key it
uses the offline writer (free, formulaic).

## Story voices

The **Topsy-Turvy Town** theme and the **Whimsical ink** art style (wobbly ink lines, leaning
buildings, bold flat colors) pair with it for a classic rhyme-book feel, using only original
characters and places.

Every new book defaults to **Rhyming and mischievous**: bouncy rhyming couplets, invented silly
words, a cheeky narrator who talks to the reader, and gloriously ridiculous grown-ups, with a warm
heart and nothing mean or scary. Other voices: **Classic storybook**, **Gentle bedtime** and
**Big adventure**. Voices live in `lib/schemas/voices.ts` (style guide, sample, and reading-level
rules, since rhyming verse can't be "one short sentence per page"). They describe qualities and
never name real authors, so the writer produces original verse rather than borrowed lines,
characters or coined words. Page rewrites keep the book's voice. Books made before voices existed
stay "Classic storybook".

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
| `npm run lulu:check [-- <exportId> \| --quote ZIP STATE \| --webhook URL]` | Check Lulu keys and cover sizes; validate an export; show real prices; subscribe order webhooks |
| `npm run story:lab -- --theme <id> --name <name> --age <n>` | Write a story only (no images, no database) to `story-lab/` for review |

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
- Orders: only the final PDFs go to the printer (frozen copies, via signed links). Webhooks are
  signature-checked (Stripe signing secret; Lulu HMAC with your API secret). Deleting a child
  deletes their order PDFs; paid orders stay as records without the book link.

## Project layout

```
app/                  pages, server actions, API routes (/api/files, /api/books/[id]/status)
components/           ChildForm, BookWizard, BookLive, book/BookPage, flipbook/Flipbook
lib/providers/        interfaces, mocks, registry; vendor folders anthropic/, gemini/, openai/
lib/jobs/             queue, runner, handlers
lib/schemas/          Zod schemas (theme, child, book, story)
lib/print/            geometry, padding, products (Lulu SKUs), cover layout, PDF renderer, PDF inspector, preflight
lib/books/            services, pagination, view model, progress
lib/orders/           order flow (quotes, checkout, print jobs, status), address rules, pricing
lib/providers/payment, lib/providers/stripe   payment interface, offline test checkout, Stripe Checkout
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
