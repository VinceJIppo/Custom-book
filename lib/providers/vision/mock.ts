import type { ConsistencyCheck, PhotoCheck, VisionProvider } from "./types";
import type { WithUsage } from "../types";

/** Offline vision: trusts photos (local size checks still run) and passes every page. */
export class MockVisionProvider implements VisionProvider {
  readonly name = "mock";
  readonly model = "mock-vision";
  async checkPhoto(): Promise<WithUsage<PhotoCheck>> {
    return { value: { faces: 1, ok: true, problems: [] }, usage: { provider: "mock", costUsd: 0 } };
  }
  async compareCharacter(): Promise<WithUsage<ConsistencyCheck>> {
    return { value: { consistent: true, score: 1, issues: [] }, usage: { provider: "mock", costUsd: 0 } };
  }
}
