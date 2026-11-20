export interface ModerationResult {
  ok: boolean;
  /** Friendly explanation for the parent when not ok. */
  message?: string;
  categories: string[];
}

export interface ModerationProvider {
  readonly name: string;
  check(text: string): Promise<ModerationResult>;
}
