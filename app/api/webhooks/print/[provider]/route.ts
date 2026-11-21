import type { NextRequest } from "next/server";
import { handlePrintWebhook } from "@/lib/orders/service";
import { webhookResponse } from "@/lib/orders/webhook";

/** Printer status webhooks, e.g. /api/webhooks/print/lulu (topic PRINT_JOB_STATUS_CHANGED). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params;
  return webhookResponse(`Print (${provider})`, req, (raw, headers) => handlePrintWebhook(provider, raw, headers));
}
