import { describe, expect, it } from "vitest";
import { fitTextIn } from "@/lib/print/fitText";

describe("text fitting in the browser", () => {
  it("runs (a leading line break once made it return nothing and crash the book viewer)", () => {
    const root = { querySelectorAll: () => [] } as unknown as ParentNode;
    expect(() => fitTextIn(root)).not.toThrow();
  });
});
