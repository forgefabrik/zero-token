import { describe, expect, it } from "vitest";
import { normalizeControlConfig } from "../src/zero-token/discovery/control-store.js";

describe("Nova discovery control", () => {
  it("normalizes scheduler limits", () => {
    const config = normalizeControlConfig({ intervalMinutes: 1, minScore: 150 });
    expect(config.intervalMinutes).toBe(30);
    expect(config.minScore).toBe(100);
    expect(config.enabled).toBe(true);
  });
});
