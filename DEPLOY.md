# Putting StoryStar online

The finished setup runs without your laptop:

```
Visitors ──> yourdomain.com (Cloudflare DNS) ──> Render: storystar-web (Next.js)
                                                   │
                         Render: storystar-worker ─┤── Render Postgres (storystar-db)
                         (books, pictures, PDFs)   │
                                                   └── Cloudflare R2 (photos, pictures, PDFs; private)
Email: Resend · Payments: Stripe · Printing: Lulu · Story and pictures: Anthropic, Google Gemini
```

Your laptop keeps working as before (SQLite, no sign-in, local files). Production uses Postgres,
email sign-in and R2. `render.yaml` describes the Render side; nothing secret is in the repo.

Do the steps in order. Use **test/sandbox keys** throughout; going live is the last section.

## 1. Cloudflare: domain and storage

1. Create a Cloudflare account and buy a domain (Domain Registration > Register Domains).
2. **R2 > Create bucket**, name it `storystar`. Leave public access **off** (no r2.dev URL, no
   custom domain on the bucket): the app hands out short-lived signed links.
3. **R2 > Manage API tokens > Create API token**: permission **Object Read & Write**, applied to the
   `storystar` bucket only. Copy the **Access Key ID**, **Secret Access Key** and the **S3 endpoint**
   (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`). The secret is shown only once.

## 2. Resend: email

1. Create a Resend account. **Domains > Add domain**: your domain (or a subdomain like `mail.yourdomain.com`).
2. Resend lists DNS records. Add each one in Cloudflare (**DNS > Records**), then click **Verify** in Resend.
3. **API Keys > Create**, with sending access. Your sender will be like `StoryStar <hello@yourdomain.com>`.

## 3. Render: app, worker and database

1. Create a Render account and connect GitHub with access to this repository.
2. **New > Blueprint**, pick the repository and the branch you want to deploy. Render reads
   `render.yaml` and shows the database, web service and worker.
3. Fill in the values it asks for (each service asks separately; use the same values in both):

   | Key | Value |
   |---|---|
   | `APP_URL` | `https://yourdomain.com` (your real address; it goes into sign-in links) |
   | `ADMIN_EMAILS` | your email |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | from step 1 (bucket `storystar`) |
   | `RESEND_API_KEY`, `EMAIL_FROM` | from step 2 |
   | `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | your keys |
   | `LULU_CLIENT_KEY`, `LULU_CLIENT_SECRET` | Lulu **sandbox** keys |
   | `STRIPE_SECRET_KEY` | Stripe **test** key (`sk_test_...`) |
   | `STRIPE_WEBHOOK_SECRET` | leave empty for now (step 5) |

4. **Apply**. The first deploy builds the image (a few minutes), applies the database migrations,
   and starts the app and the worker. When it's live, `https://<service>.onrender.com/api/health`
   answers `{"ok":true}`.

## 4. Your domain

1. In Render, open **storystar-web > Settings > Custom Domains** and add `yourdomain.com` (and `www.`).
2. Render shows the DNS records. Add them in Cloudflare. Set them to **DNS only** (grey cloud)
   until Render has verified the domain and issued the certificate.
3. Open `https://yourdomain.com`: you get the sign-in page. Sign in with your admin email.

## 5. Webhooks

- **Stripe** (test mode): Developers > Webhooks > Add endpoint `https://yourdomain.com/api/webhooks/payment`,
  events `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `checkout.session.expired`. Copy the signing secret
  (`whsec_...`) into `STRIPE_WEBHOOK_SECRET` on **storystar-web** and save (it redeploys).
- **Lulu**: on your laptop, with the same sandbox keys in `.env.local`, run
  `npm run lulu:check -- --webhook https://yourdomain.com`.

No tunnel is needed any more: Lulu downloads the PDFs straight from R2 with signed links.

## 6. Test it end to end

1. Make a book (as admin you have no limits), make print files, order it.
2. Pay with Stripe's test card `4242 4242 4242 4242`, any future date, any CVC.
3. The order page shows "With the printer". In the Lulu sandbox the job stays UNPAID unless a card
   is on file in your Lulu developer account (it's never charged in the sandbox).
4. Sign in from another browser with a different email: that account sees only its own data and
   the Starter allowance.

## Going live (later)

- **Stripe:** activate your account (business details), switch to live mode, create a live webhook
  endpoint, and set the live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`.
- **Lulu:** create a production developer account, add a card, set `LULU_API_BASE=https://api.lulu.com`
  and the production keys, and subscribe the webhook again.
- Set `ALLOW_LIVE_ORDERS=true` (the app refuses live keys until you do), then order one real book for yourself.
- Before opening to people outside your family: privacy policy and terms (the app stores photos of
  children), the friendly-error work in `BACKLOG.md`, and error alerts (Sentry).
- Check that your Render Postgres plan includes backups, and how to restore one.

## Updating the database later

Edit `prisma/schema.prisma` as usual and run `npm run db:push` locally. For production, add a
migration with `SHADOW_DATABASE_URL=<an empty Postgres> npm run db:migration -- <name>`, commit it,
and deploy: Render applies it before the new version goes live. `npm run test:postgres` runs the
tests against Postgres.
