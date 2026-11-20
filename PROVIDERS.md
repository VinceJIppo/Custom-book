# Providers

Every external service sits behind an interface in `lib/providers`, with a Mock
implementation so the app runs end to end with zero keys. `lib/providers/registry.ts`
is the only place that picks an implementation. An ESLint rule blocks provider SDK
imports anywhere outside the provider's own adapter folder.

| Interface | Phase 1 implementations | Planned |
|---|---|---|
| StoryProvider | Mock, Anthropic (Claude) | |
| ImageProvider | Mock (labeled SVG placeholders) | One real provider in Phase 2, chosen with the comparison script |
| Upscaler | Mock | Provider upscaler or hosted Real-ESRGAN (Phase 2) |
| ModerationProvider | Mock (word list) | Model-based (Phase 2) |
| PrintProvider + PrintRouter | Mock | Lulu sandbox (Phase 3 and 4), then Gelato/Peecho/RPI |

Prices in `lib/cost/prices.ts` are deliberately high-side and must be re-checked
against each provider's pricing page before relying on them.

---

## Anthropic (Claude): story text

Adapter: `lib/providers/story/anthropic/` (prompts in `prompts.ts`).
Enabled automatically when `ANTHROPIC_API_KEY` is set.

### What is sent

Per book, two calls, plus one per later text edit:

1. **Outline**: the child's first name, nickname, age, pronouns, favorite things,
   pet (only if "include pet" is on), one best friend's first name (only if "include
   best friend" is on), the lesson, the parent's optional extra instructions, and the
   theme (setting, original cast, beats, content rules).
2. **Pages**: the same details plus the outline. Returns every page's text, the
   illustration scene, layout and text zone, the dedication, the back-cover blurb and
   the cover scene.
3. **Revise text** (Phase 2 page editing): one page's text, its scene, and the parent's note.
4. **Describe character** (Phase 2): the approved Character Sheet image (illustrated,
   never a photo), to produce the Character Bible.

Never sent: photos of the child, surname, address, email, or anything about other children.

### How the call is made

- Model: `STORY_MODEL` (default `claude-sonnet-5-5`), effort `STORY_EFFORT` (default `high`).
- Streaming Messages API with structured JSON output (`output_config.format`). Shape is
  enforced by the API; lengths, page counts and spread rules are then checked with Zod
  (`lib/schemas/story.ts`). On a problem the adapter retries (up to 3 attempts) and tells
  the model exactly what to fix.
- Server-side refusal fallbacks are on (`STORY_FALLBACKS=true`): if a request is declined
  by a safety classifier, the API re-runs it on a fallback model in the same call. A
  final refusal is treated as permanent and is not retried.
- Token usage and cost are recorded on every `GenerationJob` (`costUsd`, `usage`).

### Expected cost

Prices checked 2026-11-20: Claude Sonnet 5.5 is $2 per million input tokens and $10 per
million output tokens (thinking counts as output).

| Story length | Typical | High-side estimate shown in the app |
|---|---|---|
| 12 pages | about $0.08 to $0.15 | $0.23 |
| 16 pages | about $0.10 to $0.18 | $0.26 |
| 20 pages | about $0.12 to $0.22 | $0.30 |
| 24 pages | about $0.14 to $0.25 | $0.34 |

A text-only page edit costs well under $0.02. Retries add to this and are tracked.
For comparison, illustrations (Phase 2) will dominate the cost of a book: at a planning
figure of $0.08 per illustration plus $0.02 per upscale, a 16-page book's 17 images come to
about $1.70, so a whole 16-page book is roughly $2 at the high side.

Levers if cost matters: `STORY_EFFORT=medium` (less thinking), or
`STORY_MODEL=claude-haiku-5-5` (much cheaper, lower writing quality).

### Data policy

- Anthropic's commercial API terms state API inputs and outputs are not used to train
  models by default. Confirm the current terms on your account before production use.
- Zero data retention is available to eligible organizations by arrangement with
  Anthropic; it is not a request parameter. If you get ZDR, note the date here.
- Logs in this app never include prompts with image data (`lib/log.ts` strips binary and
  base64 content).

---

## Mock providers

- **Story**: deterministic templated story following an eight-stage arc, filled with the
  child's details and the theme's cast and setting. Respects reading level, pet and
  friend toggles, and the lesson.
- **Image**: SVG placeholders tinted with the theme palette, labeled with the page,
  style and scene, with the reserved text area drawn as a hatched box.
- **Upscaler**: passes through, updating the target size.
- **Moderation**: small blocklist that keeps free text G-rated.
- **Print**: hardcover and softcover products with typical picture-book page rules
  (min 24, multiple of 2), a rough spine formula and fake quotes. Re-checked against
  Lulu in Phase 3.

## Image, upscaler and print providers

To be documented as each adapter is added (current docs checked first), including each
provider's training and retention policy and the settings used to minimize retention.
