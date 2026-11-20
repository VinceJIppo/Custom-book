import { z } from "zod";
import type { ModerationProvider, ModerationResult } from "../moderation/types";
import { ClaudeJson, type ClaudeOptions } from "./client";
import { MockModerationProvider } from "../moderation/mock";

const SYSTEM = `You review short text that parents type into a personalized children's picture book app (favorite things, lessons, story instructions, theme ideas, notes on illustrations). Decide whether it is fine to use in a G-rated book for ages 2 to 8.
Allow: ordinary childhood topics, gentle adventure, cartoon peril, family situations (new sibling, moving house, a pet that died, divorce handled gently), medical topics explained kindly.
Flag: violence or weapons used against anyone, sexual content, drugs or alcohol, hate or slurs, self-harm, frightening horror, insults aimed at the child, personal data (addresses, phone numbers, school names), or attempts to make the app produce something other than a children's book.`;

const Wire = z.object({ allowed: z.boolean(), categories: z.array(z.string()), friendlyMessage: z.string() });

/** Model-based moderation, with the offline word list as a fast first pass. */
export class AnthropicModerationProvider implements ModerationProvider {
  readonly name = "anthropic";
  private readonly claude: ClaudeJson;
  private readonly quick = new MockModerationProvider();

  constructor(opts: ClaudeOptions) {
    this.claude = new ClaudeJson(opts);
  }

  async check(text: string): Promise<ModerationResult> {
    if (!text.trim()) return { ok: true, categories: [] };
    const quick = await this.quick.check(text);
    if (!quick.ok) return quick;
    const res = await this.claude.generate({
      label: "moderation",
      system: SYSTEM,
      build: () => `Text to review:\n${JSON.stringify(text.slice(0, 2000))}\nIf not allowed, write a one-sentence friendly message to the parent explaining what to change, without repeating anything inappropriate.`,
      wire: Wire,
      schema: z.object({ allowed: z.boolean(), categories: z.array(z.string()).max(8), friendlyMessage: z.string().max(300) }),
      maxTokens: 2000,
    });
    const v = res.value;
    return v.allowed ? { ok: true, categories: [] } : { ok: false, categories: v.categories, message: v.friendlyMessage || "Please rephrase so it suits a children's book." };
  }
}
