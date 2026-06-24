import { describe, expect, it } from "vitest";

import { ProviderRegistry } from "./provider-registry.js";
import type { ProviderAdapter } from "./provider-types.js";

function adapter(id: string): ProviderAdapter {
  return {
    id,
    async listModels() {
      return [];
    },
  };
}

describe("ProviderRegistry", () => {
  it("resolves provider ids case-insensitively", () => {
    const registry = new ProviderRegistry();
    const provider = adapter("Example");

    registry.register(provider);

    expect(registry.has(" example ")).toBe(true);
    expect(registry.get("EXAMPLE")).toBe(provider);
    expect(registry.list()).toEqual([provider]);
  });

  it("rejects duplicate provider ids", () => {
    const registry = new ProviderRegistry();
    registry.register(adapter("example"));

    expect(() => registry.register(adapter("EXAMPLE"))).toThrow(
      "Provider already registered: example",
    );
  });

  it("rejects empty and unknown provider ids", () => {
    const registry = new ProviderRegistry();

    expect(() => registry.register(adapter(" "))).toThrow(
      "Provider id must not be empty.",
    );
    expect(() => registry.get("missing")).toThrow("Unknown provider: missing");
  });
});
