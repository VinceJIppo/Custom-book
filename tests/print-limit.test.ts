import { afterEach, describe, expect, it } from "vitest";
import { limitPictures } from "@/lib/print/render";
import { resetConfigCache } from "@/lib/config";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("print picture limit", () => {
  afterEach(() => {
    process.env.PRINT_IMAGE_CONCURRENCY = "4";
    resetConfigCache();
  });

  it.each([1, 2])("never prepares more than %i picture(s) at once, and an error frees its slot", async (limit) => {
    process.env.PRINT_IMAGE_CONCURRENCY = String(limit);
    resetConfigCache();
    let now = 0;
    let most = 0;
    const job = (i: number) =>
      limitPictures(async () => {
        now++;
        most = Math.max(most, now);
        await tick();
        now--;
        if (i === 1) throw new Error("bad picture");
        return i;
      });
    const results = await Promise.allSettled([0, 1, 2, 3, 4, 5].map(job));
    expect(most).toBe(limit);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    // The slot freed by the error was handed on: a later picture still runs.
    expect(await limitPictures(async () => "after")).toBe("after");
  });
});
