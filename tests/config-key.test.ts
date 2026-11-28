import { afterEach, describe, expect, it } from "vitest";
import { getConfig, resetConfigCache } from "@/lib/config";

describe("Anthropic key", () => {
  const saved = { a: process.env.ANTHROPIC_API_KEY, s: process.env.STORYSTAR_ANTHROPIC_API_KEY };
  afterEach(() => {
    for (const [k, v] of [["ANTHROPIC_API_KEY", saved.a], ["STORYSTAR_ANTHROPIC_API_KEY", saved.s]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetConfigCache();
  });

  it("can come from STORYSTAR_ANTHROPIC_API_KEY (cloud sessions keep ANTHROPIC_API_KEY for themselves)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.STORYSTAR_ANTHROPIC_API_KEY = "sk-ant-test-fallback";
    resetConfigCache();
    expect(getConfig().ANTHROPIC_API_KEY).toBe("sk-ant-test-fallback");
  });

  it("prefers ANTHROPIC_API_KEY when both are set, and a blank one counts as unset", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-main";
    process.env.STORYSTAR_ANTHROPIC_API_KEY = "sk-ant-test-fallback";
    resetConfigCache();
    expect(getConfig().ANTHROPIC_API_KEY).toBe("sk-ant-test-main");
    process.env.ANTHROPIC_API_KEY = " ";
    resetConfigCache();
    expect(getConfig().ANTHROPIC_API_KEY).toBe("sk-ant-test-fallback");
  });
});
