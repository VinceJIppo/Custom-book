/**
 * Resend adapter (raw HTTP). Checked against resend.com/docs on 2026-11-21:
 * POST https://api.resend.com/emails with Authorization: Bearer <key>,
 * JSON { from, to, subject, html, text }, optional Idempotency-Key header
 * (keys last 24 hours); the response is { id }.
 */
import type { EmailMessage, EmailProvider } from "../email/types";
import { PermanentProviderError } from "../types";

export class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(private readonly opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }) {}

  async send(m: EmailMessage) {
    const res = await (this.opts.fetchImpl ?? fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.opts.apiKey}`,
        "Content-Type": "application/json",
        ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: this.opts.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    const body = await res.text();
    if (!res.ok) {
      const msg = `Resend failed (HTTP ${res.status}): ${body.slice(0, 300)}`;
      if (res.status === 429 || res.status >= 500) throw new Error(msg);
      throw new PermanentProviderError(msg);
    }
    return { id: (JSON.parse(body) as { id: string }).id };
  }
}
