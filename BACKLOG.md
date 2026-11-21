# Backlog

Requirements to finish before the app is done, in addition to Phase 5 in the build brief.

## Every error shows a friendly message (required before launch)

Rule: a parent never sees raw technical text (HTTP codes, endpoint paths, JSON, stack traces,
provider names they don't know). Every error says what happened in plain English and what to
do next. Technical details go to the server log (and the admin page where useful), not the page.

Plan:

1. One translation layer, `lib/errors/friendly.ts`: turns provider errors into
   `{ message, field?, action? }`. Each adapter tags its errors with a code
   (address, file, payment, rate limit, auth/config, outage, unknown).
2. Parse structured provider errors instead of showing them. For Lulu's 400s, read
   `shipping_address.detail.errors[]` (`path`, `message`) and attach the message to the right form
   field (postcode, state, city, street).
3. Store a friendly message on jobs/exports/orders (`error` for people, `errorDetail` for logs and
   admins) and show only the friendly one in parent-facing pages.
4. A test that fails if a parent-facing page or action returns text containing `HTTP `, `{"`,
   `POST /`, `GET /`, or a stack trace.

Known places that show raw errors today (found 2026-11-21):

| Where | What the parent can see | Example |
|---|---|---|
| Order form, "See shipping options" (`lib/orders/service.ts` `shippingQuotes`) | Lulu's raw HTTP 400 body | `Lulu POST /print-job-cost-calculations/ failed (HTTP 400): {"shipping_address":{"detail":{"errors":[{"code":"INVALID","path":"postcode","message":"Postal code entered does not match the city or state that were entered. It should look like ['85000', '86999']"}]}}}`. Should be: "That ZIP code doesn't match Phoenix, AZ. ZIP codes there look like 85000 to 86999." shown under the ZIP field. |
| Order checkout and refund (`startCheckout`, `refundOrder`) | Raw Lulu or Stripe errors after "couldn't price this order", "Checkout couldn't start", "The refund didn't go through" | |
| Order page and admin (`order.statusReason`) | "Couldn't send the order to the printer: <raw error>" when the print job fails | Setup problems are shown to the parent: "lulu downloads the PDFs itself and can't reach localhost:3000. Set PUBLIC_BASE_URL in .env.local...". Parents should see "We're having trouble sending your book to the printer. We'll retry; you won't be charged again." and the setup advice should go to the admin page only. |
| Print files page (`app/books/[id]/print/page.tsx`) | `Making the files failed: {e.error}` and Lulu validation problems/job errors | Chromium or render errors |
| Page editor (`app/books/[id]/pages/[pageId]/page.tsx`) | `The last picture change didn't work: {lastJob.error}` | Gemini/OpenAI API errors |
| Character options (`app/children/[id]/character/page.tsx`) | `This set didn't work: {s.error}` | Image provider errors |
| Book progress (`components/BookLive.tsx`, `/api/books/[id]/status`) | Failed story or picture job errors | Claude errors such as "outline failed after 3 attempts: ..." |
| Server actions that redirect with `?error=` | Whatever message the service returned | |
| Next.js error pages | Done: friendly `app/error.tsx` and `app/not-found.tsx` (2026-11-21) | |

When fixing, also check story/vision messages from `lib/providers/anthropic/client.ts`
(retry summaries) and the Gemini 400 seen earlier (`response_format.mime_type`).
