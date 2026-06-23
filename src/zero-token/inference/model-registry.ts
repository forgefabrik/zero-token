import type { ModelInfo } from "../models/model-types.js";
import { getCachedModels } from "../models/model-cache.js";

/**
 * Model Registry – provides model info from the cache for inference routing.
 */
export class ModelRegistry {
  private modelsCache: ModelInfo[] | null = null;
  private lastFetch: number = 0;
  private cacheTTL: number = 60_000; // 1 minute in-memory TTL

  /**
   * Get all known models.
   */
  async getModels(): Promise<ModelInfo[]> {
    if (this.modelsCache && Date.now() - this.lastFetch < this.cacheTTL) {
      return this.modelsCache;
    }

    const cached = await getCachedModels();
    if (cached) {
      this.modelsCache = cached;
      this.lastFetch = Date.now();
      return cached;
    }

    return [];
  }

  /**
   * Get a model by ID.
   */
  async getModel(modelId: string): Promise<ModelInfo | undefined> {
    const models = await this.getModels();
    return models.find((m) => m.id === modelId);
  }

  /**
   * Check if a model exists and is enabled.
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    const model = await this.getModel(modelId);
    return model?.enabled === true;
  }

  /**
   * Invalidate the in-memory cache.
   */
  invalidate(): void {
    this.modelsCache = null;
    this.lastFetch = 0;
  }
}

/** Singleton instance */
export const modelRegistry = new ModelRegistry();
