import { describe, expect, it } from "vitest";
import { getCandidateProbeCapability } from "../src/zero-token/discovery/candidate-probe-capability.js";

describe("probe capability metadata", () => {
  it("returns a stable result shape", () => {
    const result = getCandidateProbeCapability();
    expect(Object.keys(result).sort()).toEqual(["available", "browser"]);
    expect(result.browser).toBe("chromium");
  });
});
