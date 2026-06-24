import { ProviderRegistry } from "./provider-registry.js";
import type { ProviderModel } from "./provider-types.js";

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function modelKey(providerId: string, modelId: string): string {
  return `${normalize(providerId)}:${normalize(modelId)}`;
}

export class ProviderModelCatalog {
  private models = new Map<string, ProviderModel>();

  constructor(private readonly registry: ProviderRegistry) {}

  async refresh(): Promise<readonly ProviderModel[]> {
    const next = new Map<string, ProviderModel>();

    for (const provider of this.registry.list()) {
      const providerId = normalize(provider.id);
      const models = await provider.listModels();

      for (const model of models) {
        const modelId = model.id.trim();
        if (!modelId) {
          throw new Error(`Provider ${providerId} returned a model without an id.`);
        }

        if (normalize(model.providerId) !== providerId) {
          throw new Error(
            `Provider ${providerId} returned model ${modelId} with mismatched provider id.`,
          );
        }

        const key = modelKey(providerId, modelId);
        if (next.has(key)) {
          throw new Error(`Duplicate provider model: ${key}`);
        }

        next.set(
          key,
          Object.freeze({
            ...model,
            id: modelId,
            providerId,
            displayName: model.displayName.trim() || modelId,
          }),
        );
      }
    }

    this.models = next;
    return this.list();
  }

  list(): readonly ProviderModel[] {
    return Object.freeze([...this.models.values()]);
  }

  find(providerId: string, modelId: string): ProviderModel | undefined {
    return this.models.get(modelKey(providerId, modelId));
  }

  clear(): void {
    this.models.clear();
  }
}
