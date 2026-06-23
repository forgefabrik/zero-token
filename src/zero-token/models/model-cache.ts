import type { ModelsCache, ModelInfo } from "./model-types.js";
import { modelsCachePath } from "../config/paths.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import logger from "../logger.js";

const DEFAULT_TTL_SECONDS = 3600; // 1 hour

let memoryCache: ModelsCache | null = null;

/**
 * Load the model cache from disk (or memory).
 */
export async function loadCache(): Promise<ModelsCache | null> {
  if (memoryCache) return memoryCache;

  try {
    const data = await readStored<ModelsCache>(modelsCachePath());
    if (data) {
      memoryCache = {
        ...data,
        models: Array.isArray(data.models) ? data.models : [],
      };
    }
    return memoryCache;
  } catch (err) {
    logger.warn({ err }, "Konnte Modellcache nicht laden");
    return null;
  }
}

/**
 * Save the model cache to disk.
 */
export async function saveCache(models: ModelInfo[], ttlSeconds?: number): Promise<ModelsCache> {
  const cache: ModelsCache = {
    fetchedAt: new Date().toISOString(),
    ttlSeconds: ttlSeconds ?? DEFAULT_TTL_SECONDS,
    models,
  };

  memoryCache = cache;

  try {
    await writeStored(modelsCachePath(), cache);
    logger.info({ count: models.length }, "Modellcache gespeichert");
  } catch (err) {
    logger.error({ err }, "Fehler beim Speichern des Modellcaches");
  }

  return cache;
}

/**
 * Check if the cache is still valid (within TTL).
 */
export function isCacheValid(cache: ModelsCache | null): boolean {
  if (!cache) return false;
  const fetched = new Date(cache.fetchedAt).getTime();
  const now = Date.now();
  return now - fetched < cache.ttlSeconds * 1000;
}

/**
 * Get cached models (or null if not cached / expired).
 */
export async function getCachedModels(): Promise<ModelInfo[] | null> {
  const cache = await loadCache();
  if (cache && isCacheValid(cache)) {
    return cache.models;
  }
  return null;
}

/**
 * Invalidate the cache (force refresh next time).
 */
export function invalidateCache(): void {
  memoryCache = null;
}
