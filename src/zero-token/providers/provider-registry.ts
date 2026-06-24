export interface ProviderAdapter {
  readonly id: string;
  listModels(): Promise<readonly string[]>;
}

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderAdapter>();

  register(provider: ProviderAdapter): void {
    const id = provider.id.trim().toLowerCase();
    if (!id) {
      throw new Error("Provider id must not be empty.");
    }
    if (this.providers.has(id)) {
      throw new Error(`Provider already registered: ${id}`);
    }
    this.providers.set(id, provider);
  }

  get(id: string): ProviderAdapter {
    const provider = this.providers.get(id.trim().toLowerCase());
    if (!provider) {
      throw new Error(`Unknown provider: ${id}`);
    }
    return provider;
  }

  list(): readonly ProviderAdapter[] {
    return Object.freeze([...this.providers.values()]);
  }
}
