import { describe, expect, it } from "vitest";

import { ProviderModelCatalog } from "./provider-model-catalog.js";
import { ProviderRegistry } from "./provider-registry.js";
import type { ProviderAdapter } from "./provider-types.js";

function provider(id: string, modelIds: readonly string[]): ProviderAdapter {
  return {
    id,
    async listModels() {
      return modelIds.map((modelId) => ({
        id: modelId,
        displayName: modelId,
        providerId: id,
        supportsStreaming: true,
      }));
    },
  };
}

describe("ProviderModelCatalog", () => {
  it("collects models from all registered providers", async () => {
    const registry = new ProviderRegistry();
    registry.register(provider("alpha", ["a-1", "a-2"]));
    registry.register(provider("beta", ["b-1"]));
    const catalog = new ProviderModelCatalog(registry);

    const models = await catalog.refresh();

    expect(models).toHaveLength(3);
    expect(catalog.find("ALPHA", "A-1")?.providerId).toBe("alpha");
    expect(catalog.find("beta", "b-1")?.id).toBe("b-1");
  });

  it("rejects models assigned to another provider", async () => {
    const registry = new ProviderRegistry();
    registry.register({
      id: "alpha",
      async listModels() {
        return [
          {
            id: "wrong",
            displayName: "Wrong",
            providerId: "beta",
            supportsStreaming: false,
          },
        ];
      },
    });
    const catalog = new ProviderModelCatalog(registry);

    await expect(catalog.refresh()).rejects.toThrow(
      "Provider alpha returned model wrong with mismatched provider id.",
    );
  });

  it("clears cached models", async () => {
    const registry = new ProviderRegistry();
    registry.register(provider("alpha", ["a-1"]));
    const catalog = new ProviderModelCatalog(registry);

    await catalog.refresh();
    catalog.clear();

    expect(catalog.list()).toEqual([]);
  });
});
