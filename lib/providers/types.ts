/** Shared provider types. No provider-specific code belongs here. */

export interface Usage {
  provider: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  imageCalls?: number;
  attempts?: number;
  costUsd: number;
}

export interface WithUsage<T> {
  value: T;
  usage: Usage;
}

export interface ImageData {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
}

/** Thrown for failures that retrying will not fix (bad input, refusal, policy). */
export class PermanentProviderError extends Error {
  readonly permanent = true;
  constructor(message: string) {
    super(message);
    this.name = "PermanentProviderError";
  }
}

export function sumUsage(provider: string, parts: Usage[]): Usage {
  const total: Usage = { provider, costUsd: 0 };
  for (const p of parts) {
    total.model = p.model ?? total.model;
    total.inputTokens = (total.inputTokens ?? 0) + (p.inputTokens ?? 0);
    total.outputTokens = (total.outputTokens ?? 0) + (p.outputTokens ?? 0);
    total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (p.cacheReadTokens ?? 0);
    total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + (p.cacheWriteTokens ?? 0);
    total.imageCalls = (total.imageCalls ?? 0) + (p.imageCalls ?? 0);
    total.costUsd += p.costUsd;
  }
  total.attempts = parts.length;
  total.costUsd = Math.round(total.costUsd * 1e6) / 1e6;
  return total;
}
