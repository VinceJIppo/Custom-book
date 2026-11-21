import crypto from "node:crypto";
import type { EmailMessage, EmailProvider } from "./types";
import { log } from "../../log";

/**
 * Offline email: keeps the last messages in memory (shared across module
 * copies) so the dev sign-in page can show the link, and logs the subject only.
 */
const outbox: EmailMessage[] = ((globalThis as { __mockOutbox?: EmailMessage[] }).__mockOutbox ??= []);

export class MockEmailProvider implements EmailProvider {
  readonly name = "mock";
  async send(message: EmailMessage) {
    outbox.push(message);
    if (outbox.length > 50) outbox.shift();
    log.info("Email (mock, not sent)", { to: message.to, subject: message.subject });
    return { id: `mock_${crypto.randomUUID().slice(0, 8)}` };
  }
  /** The newest message to this address, for dev sign-in and tests. */
  lastTo(to: string) {
    return [...outbox].reverse().find((m) => m.to === to) ?? null;
  }
}
