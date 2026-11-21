# Providers

Every external service sits behind an interface in `lib/providers`, with a Mock
implementation so the app runs end to end with zero keys. `lib/providers/registry.ts`
is the only place that picks an implementation. An ESLint rule blocks provider SDK
imports outside each vendor's folder (`lib/providers/anthropic`, `gemini`, `openai`).

| Interface | Implementations | Used for |
|---|---|---|
| StoryProvider | Mock, Anthropic (Claude) | Story spine, manuscript, editor review and rewrite, art direction, text rewrites, Character Bible, Custom Theme drafts |
| ImageProvider | Mock, **Gemini** (default), OpenAI | Character sheets, page art, picture edits |
| Upscaler | Mock, Sharp (local) | Exact print pixels at 300 ppi |
| VisionProvider | Mock, Anthropic (Claude) | One-face photo check; page check (likeness to the character, and words versus picture) |
| ModerationProvider | Mock (word list), Anthropic | Parent free text: favorites, notes, themes, instructions |
| PrintProvider + PrintRouter | Mock, **Lulu** | Products, cover size, file validation (ordering in Phase 4) |

Docs for every adapter below were read on **2026-11-20**. Prices in
`lib/cost/prices.ts` are high-side; actual cost is recorded from each response on
`GenerationJob.costUsd`.

## What goes where (child data)

| Data | Sent to |
|---|---|
| Raw photos of the child | **Image provider** (only to draw the character sheet) and **Claude** (one-face photo check). Never used for pages. Deleted by default once a character is approved. |
| Approved character sheet (illustration) | Image provider (every page), Claude (Character Bible, likeness checks) |
| First name, nickname, age, pronouns, favorites, pet, friend, lesson | Claude (story text). The image provider sees the hero's name inside scene prompts. |
| Final PDFs | Print provider (Phases 3 and 4) |

---

## Google Gemini: images (default)

Adapter: `lib/providers/gemini/image.ts` (raw HTTP, no SDK).

- **Endpoint:** `POST https://generativelanguage.googleapis.com/v1beta/interactions`
  (the Interactions API; `generateContent` is now "legacy"), headers `x-goog-api-key`
  and `Api-Revision: 2026-05-20`.
- **Model:** `gemini-nano-banana-2.1` ("Nano Banana 2.1", the recommended workhorse).
  Supports up to 4 character reference images and 1K, 2K and 4K output.
  Also available: `gemini-3-pro-image` (premium, $0.134 to $0.24 per image).
- **Request:** text prompt plus `{type:"image", mime_type, data}` reference parts, and
  `response_format: {type:"image", aspect_ratio, image_size}`.
- **Storage:** the Interactions API stores requests for **55 days** by default (paid
  tier). The adapter always sends **`store: false`**, so nothing is kept for multi-turn use.
- **Data use:** Google's pricing page lists paid-tier inputs as **not** used to improve
  its products (the free tier is). Use a paid-tier key.
- **Watermark:** all Gemini images carry an invisible SynthID watermark.
- **Price (paid tier):** $0.0336 per 1K image, $0.0504 per 2K, $0.113 per 4K, plus
  about $0.0017 per reference image. Size is chosen per layout: 4K for full pages, the
  cover and spreads (so print needs no real upscaling), 2K for smaller art.
  Override with `GEMINI_PAGE_SIZE`.

## OpenAI GPT Image: images (comparison / alternative)

Adapter: `lib/providers/openai/image.ts` (raw HTTP).

- **Models:** `gpt-image-2.6-sunburst` (editing precision, default here) and
  `gpt-image-2.6-flare` (faster). `gpt-image-1.5` and `gpt-image-1-mini` shut down on
  Dec 1, 2026; `gpt-image-2` on Feb 10, 2027.
- **Endpoints:** `/v1/images/edits` (multipart, repeated `image[]` parts) when a
  character reference is attached, `/v1/images/generations` otherwise.
  `input_fidelity` is not used (newer models always use high fidelity).
- **Size:** custom `WxH`, multiples of 16, edges up to 3840 px, at most 8.3 MP. A full
  page is requested at 2624 x 2624; spreads at 3840 x 1936 and resized for print.
- **Price:** token based: $5 per 1M text input, $8 per 1M image input, $30 per 1M image
  output. Planning figure: about $0.30 per high-quality page. Use OpenAI's calculator for
  exact numbers; the app records real cost from the `usage` block.
- **Data use:** API data is not used for training by default. Abuse-monitoring logs keep
  content up to 30 days unless your org is approved for Zero Data Retention or
  Modified Abuse Monitoring.

## Anthropic (Claude): story, vision, moderation

Adapter folder: `lib/providers/anthropic/` (shared caller in `client.ts`).

- **Story:** `STORY_MODEL` (default `claude-sonnet-5-5`), structured JSON output,
  Zod-validated, retry with feedback. Four to eight calls per book: story spine, manuscript
  (one more try if verse lines run long), editor review, then when the editor finds problems a
  targeted rewrite (changed pages only), a second review and a final polish, and art direction.
  A story costs about $0.50 to $0.80 (see the in-app estimate). `npm run story:lab` runs
  just this part.
- **Vision:** `VISION_MODEL` (default `claude-sonnet-5-5`, effort `medium`):
  - Photo check: counts faces, checks the face is clear, returns friendly tips. About $0.01.
  - Page check, one call per picture, two scores from 0 to 1:
    - Likeness (when the hero is in the scene): compares the page with the approved sheet and
      Character Bible.
    - Words versus picture: compares the picture with the page's words, its must-show list and
      continuity notes (for example the words say the hat is on his head but it's on his toes,
      or the town is no longer upside down).

    Below 0.7 on either, the page is redrawn once with the specific problems as corrections.
    If it still fails, it's flagged for the parent with "Likeness:" and "Story:" notes.
    About $0.01 to $0.02 per check.
- **Moderation:** word list first (free), then Claude for anything that passes.
- **Character Bible and theme drafts:** one call each.
- Refusal fallbacks are on (`STORY_FALLBACKS`): a request a safety classifier declines
  is re-run on a fallback model in the same call.
- **Data use:** commercial API inputs are not used for training by default. Zero data
  retention is available to eligible organizations by arrangement.

## Lulu: printing

Adapter: `lib/providers/lulu/print.ts` (raw HTTP), checked against Lulu's OpenAPI spec
(`api.lulu.com/api-docs/openapi-specs/openapi_public.yml`), the Product Specification Sheet
and the Book Creation Guide on 2026-11-20.

- **Sandbox:** `https://api.sandbox.lulu.com`. Sandbox accounts are separate from production
  (developers.sandbox.lulu.com); print jobs there are never printed.
- **Auth:** OpenID Connect client credentials. `POST /auth/realms/glasstree/protocol/openid-connect/token`
  with `Authorization: Basic base64(client_key:client_secret)`. Tokens are cached and refreshed.
- **Products** (`lib/print/products.ts`), all premium full color on 80# coated white with a gloss cover.
  These use the new "dotted" POD package IDs (live March 31, 2026; the old 27-character IDs stop
  working Feb 1, 2027):

  | Product | POD package ID | Pages |
  |---|---|---|
  | Hardcover 8.5 x 8.5 (default) | `0850X0850.FC.PRE.CW.080CW444.GXX` | 24 to 800 |
  | Softcover 8.5 x 8.5 | `0850X0850.FC.PRE.PB.080CW444.GXX` | 32 to 800 |
  | Hardcover 8.5 x 11 | `0850X1100.FC.PRE.CW.080CW444.GXX` | 24 to 800 |
  | Softcover 8.5 x 11 | `0850X1100.FC.PRE.PB.080CW444.GXX` | 32 to 800 |

  Lulu has no full-color 8 x 10 product, so the portrait size is 8.5 x 11 (US Letter).
  Lulu lists base prices of $10.98 (hardcover) and $2.16 (softcover), plus $0.2148 per page for these
  products; Phase 4 uses its live cost API.
- **Cover size:** `POST /cover-dimensions/` with the POD package ID and page count. The spine width
  comes from Lulu's published table (hardcover: 0.25 in for 24 to 84 pages) or formula (paperback:
  pages / 444 + 0.06 in). No spine text at 80 pages or fewer.
- **File rules we follow:** single-page interior PDF at trim + 0.125 in bleed; one-page wraparound
  cover; images 300 to 600 ppi; fonts embedded; no transparency; 0.5 in safety margin (plus gutter
  on the binding side and a hinge keep-out on hardcovers); no crop marks; no password protection.
- **Validation:** `POST /validate-interior/` and `/validate-cover/` take a public `source_url`; results
  are polled (`VALIDATED`/`NORMALIZED` = pass, `ERROR` = fail with reasons). Limits: 3 interior and
  6 cover validations per minute (the adapter backs off on HTTP 429).
- **Data sent:** only the final PDFs (via signed links that expire after `PRINT_FILE_URL_TTL_SECONDS`,
  6 hours by default). Never photos.

## Upscaler

`lib/providers/upscale/sharp.ts`: Lanczos resize to the exact print size, center crop to
the layout's aspect, sRGB, tagged 300 ppi. Because Gemini renders full pages at 4K
(4096 px) and print needs 2625 px, this is a downscale or a small upscale (2K art for
picture-on-top pages is about 1.04x). A hosted super-resolution model (Real-ESRGAN on
Replicate) can be added behind the same interface. Its docs page renders with JavaScript
and couldn't be read from this environment, so it wasn't built.

## Expected cost per book (high-side estimates the app shows)

| | 12 pages | 16 pages | 24 pages |
|---|---|---|---|
| Gemini + Claude | $2.53 | $3.24 | $4.67 |
| OpenAI + Claude | $5.67 | $7.30 | $10.58 |

These assume every page at 4K, a likeness check per page, and a redraw on a quarter of
pages. Typical real cost is lower: roughly $2 for a 16-page Gemini book.
A character sheet set (3 options) costs about $0.16 with Gemini.

## Comparison script

```bash
npm run compare -- --a gemini --b openai --character path/to/approved-sheet.png --style watercolor-storybook --name Teddy
```

It draws the same 4 scenes (full page, close-up, two-page spread, night scene) with each
provider and writes `comparisons/<time>/index.html` and `grid.png`, with time and cost per
image. A run costs roughly $0.50 (Gemini) plus $1.20 (OpenAI).

## Mock providers

- **Story:** deterministic eight-stage story from the child's details and the theme.
  Drafts custom themes by matching keywords.
- **Image:** SVG placeholders labeled with page, style and scene, showing the reserved text area.
- **Vision:** passes every photo and page. **Moderation:** small word list.
- **Upscaler:** pass-through. **Print:** typical picture-book rules (min 24 pages, multiple of 2).
