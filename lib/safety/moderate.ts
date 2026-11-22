import { getModeration } from "../providers/registry";
import { recordInlineSpend } from "../credits/spend";
import type { ModerationResult } from "../providers/moderation/types";

/** Moderation, with the cost of any model call recorded and charged to the user when known. */
export async function moderate(text: string, who?: { userId: string; bookId?: string }): Promise<ModerationResult> {
  const r = await getModeration().check(text);
  if (who && r.usage && r.usage.costUsd > 0) await recordInlineSpend(who.userId, "moderation.check", r.usage, { bookId: who.bookId });
  return r;
}
