import type { ProviderAdapter } from "./provider-types.js";

function normalizeProviderId(id: string): string {
  const normalized = id.trim().toLowerCase();
  if (!normalized) {
    throw new Error("Provider id must not be empty.");
  }
  return normalized;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    const id = normalizeProviderId(provider.id);
    if (this.providers.has(id)) {
      throw new Error(`Provider already registered: ${id}`);
    }
    this.providers.set(id, provider);
  }

  has(id: string): boolean {
    return this.providers.has(normalizeProviderId(id));
  }

  get(id: string): ProviderAdapter {
    const normalizedId = normalizeProviderId(id);
    const provider = this.providers.get(normalizedId);
    if (!provider) {
      throw new Error(`Unknown provider: ${normalizedId}`);
    }
    return provider;
  }

  list(): readonly ProviderAdapter[] {
    return Object.freeze([...this.providers.values()]);
  }
}
