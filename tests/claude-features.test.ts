import { describe, expect, it } from "vitest";
import { AnthropicVisionProvider } from "@/lib/providers/anthropic/vision";
import { AnthropicModerationProvider } from "@/lib/providers/anthropic/moderation";
import { AnthropicStoryProvider } from "@/lib/providers/anthropic/story";
import type { ModelCaller, ModelCallResult } from "@/lib/providers/anthropic/client";

function scripted(replies: unknown[]) {
  const seen: Array<{ system: string; content: unknown }> = [];
  const caller: ModelCaller = async ({ system, content }) => {
    seen.push({ system, content });
    const r = replies.shift();
    return { text: JSON.stringify(r), stopReason: "end_turn", model: "claude-sonnet-5-5", usage: { input_tokens: 2000, output_tokens: 300 } } satisfies ModelCallResult;
  };
  return { caller, seen };
}
const img = { data: Buffer.from("x"), mimeType: "image/png", width: 1, height: 1 };
const opts = { model: "claude-sonnet-5-5", effort: "medium" as const, fallbacks: true };

describe("Claude vision and moderation (no network)", () => {
  it("flags drift below the threshold and sends both images", async () => {
    const { caller, seen } = scripted([{ score: 0.55, issues: ["no glasses"] }, { score: 0.92, issues: [] }]);
    const v = new AnthropicVisionProvider({ ...opts, caller });
    const a = await v.compareCharacter({ sheet: img, page: img, bible: null, childName: "Teddy" });
    expect(a.value).toEqual({ consistent: false, score: 0.55, issues: ["no glasses"] });
    expect((seen[0].content as Array<{ type: string }>).filter((b) => b.type === "image")).toHaveLength(2);
    const b = await v.compareCharacter({ sheet: img, page: img, bible: null, childName: "Teddy" });
    expect(b.value.consistent).toBe(true);
  });

  it("photo check needs exactly one clear face and explains problems", async () => {
    const { caller } = scripted([{ faces: 2, faceClearlyVisible: true, problems: [] }, { faces: 1, faceClearlyVisible: true, problems: [] }]);
    const v = new AnthropicVisionProvider({ ...opts, caller });
    const two = await v.checkPhoto(img);
    expect(two.value.ok).toBe(false);
    expect(two.value.problems[0]).toMatch(/2 faces/);
    expect((await v.checkPhoto(img)).value.ok).toBe(true);
  });

  it("moderation uses the word list first, then the model", async () => {
    const { caller, seen } = scripted([{ allowed: false, categories: ["personal data"], friendlyMessage: "Please leave out addresses." }]);
    const m = new AnthropicModerationProvider({ ...opts, caller });
    expect((await m.check("he has a gun")).ok).toBe(false);
    expect(seen).toHaveLength(0);
    const r = await m.check("we live at 12 Oak Street");
    expect(r).toMatchObject({ ok: false, message: "Please leave out addresses." });
  });

  it("theme drafting rejects drafts that contain protected characters and retries", async () => {
    const base = {
      id: "star-pals", name: "Star Pals", genre: "space", ageRange: [3, 7], pitch: "The child flies to the stars with friends.",
      setting: "A tiny moon village with lantern houses", supportingCast: [{ name: "Yoda", role: "guide", look: "small green sage" }],
      storyBeats: ["morning", "launch", "trouble", "idea", "teamwork", "home"], powerIdeas: "", artDirection: { defaultStyle: "soft-3d", palette: ["#111111", "#222222", "#333333", "#444444"], mood: "calm" },
      contentRules: ["gentle"],
    };
    const fixed = { ...base, supportingCast: [{ name: "Pip Comet", role: "guide", look: "small silver robot" }] };
    const { caller, seen } = scripted([base, fixed]);
    const s = new AnthropicStoryProvider({ ...opts, caller });
    const r = await s.draftTheme({ description: "loves space" });
    expect(r.value.supportingCast[0].name).toBe("Pip Comet");
    expect(JSON.stringify(seen[1].content)).toMatch(/Remove Star Wars/);
  });
});
