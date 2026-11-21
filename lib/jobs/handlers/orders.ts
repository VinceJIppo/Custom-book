import type { GenerationJob } from "@prisma/client";
import { refreshOrderStatus, submitOrder } from "../../orders/service";
import { PermanentProviderError } from "../../providers/types";
import type { JobOutcome } from "../types";

function orderIdOf(job: GenerationJob) {
  const id = (job.payload as { orderId?: string }).orderId;
  if (!id) throw new PermanentProviderError("Job has no order id");
  return id;
}

/** Sends a paid order's frozen PDFs to the printer. */
export async function orderSubmitHandler(job: GenerationJob): Promise<JobOutcome> {
  const result = await submitOrder(orderIdOf(job), job.attempts);
  return { result };
}

/** Polling fallback: asks the printer for the order's latest status. */
export async function orderStatusHandler(job: GenerationJob): Promise<JobOutcome> {
  const order = await refreshOrderStatus(orderIdOf(job));
  return { result: { status: order?.status ?? "missing" } };
}
