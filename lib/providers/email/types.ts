/** Transactional email (sign-in links, order updates). */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Prevents duplicates when a send is retried. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<{ id: string }>;
}
