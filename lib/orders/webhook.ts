import { WebhookSignatureError } from "../providers/print/types";
import { errorMessage, log } from "../log";

/** Runs a webhook handler: 400 for bad signatures (no retry), 500 for our errors (provider retries). */
export async function webhookResponse(name: string, req: Request, handle: (raw: string, headers: Record<string, string>) => Promise<unknown>) {
  const raw = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  try {
    await handle(raw, headers);
    return Response.json({ received: true });
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      log.warn(`${name} webhook rejected`, { reason: err.message });
      return Response.json({ error: "invalid signature" }, { status: 400 });
    }
    log.error(`${name} webhook failed`, { err: errorMessage(err) });
    return Response.json({ error: "processing failed" }, { status: 500 });
  }
}
