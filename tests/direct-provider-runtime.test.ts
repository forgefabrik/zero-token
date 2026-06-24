import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("direct provider runtime", () => {
  it("activates the direct ChatGPT provider", () => {
    const registry = readFileSync(
      "src/zero-token/providers/provider-runtime-registry.ts",
      "utf8",
    );
    expect(registry).toContain("chatgpt-direct-provider.js");
    expect(registry).not.toContain("chatgpt-openclaw-provider.js");
  });
});
