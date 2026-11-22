export interface ModerationResult {
  ok: boolean;
  /** Friendly explanation for the parent when not ok. */
  message?: string;
  categories: string[];
  /** Cost of the model call, when one was made. */
  usage?: import("../types").Usage;
}

export interface ModerationProvider {
  readonly name: string;
  check(text: string): Promise<ModerationResult>;
}
