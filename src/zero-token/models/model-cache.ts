import type { ModelsCache, ModelInfo } from "./model-types.js";
import { modelsCachePath } from "../config/paths.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import logger from "../logger.js";

const DEFAULT_TTL_SECONDS = 3600;
const CACHE_VERSION = 2 as const;

let memoryCache: ModelsCache | null = null;

export async function loadCache(): Promise<ModelsCache | null> {
  if (memoryCache) return memoryCache;

  try {
    const data = await readStored<Partial<ModelsCache>>(modelsCachePath());
    if (!data || data.version !== CACHE_VERSION || !Array.isArray(data.models)) {
      return null;
    }

    memoryCache = {
      version: CACHE_VERSION,
      fetchedAt: typeof data.fetchedAt === "string" ? data.fetchedAt : new Date(0).toISOString(),
      ttlSeconds: typeof data.ttlSeconds === "number" ? data.ttlSeconds : DEFAULT_TTL_SECONDS,
      models: data.models,
    };
    return memoryCache;
  } catch (err) {
    logger.warn({ err }, "Konnte Modellcache nicht laden");
    return null;
  }
}

export async function saveCache(models: ModelInfo[], ttlSeconds?: number): Promise<ModelsCache> {
  const cache: ModelsCache = {
    version: CACHE_VERSION,
    fetchedAt: new Date().toISOString(),
    ttlSeconds: ttlSeconds ?? DEFAULT_TTL_SECONDS,
    models,
  };

  memoryCache = cache;

  try {
    await writeStored(modelsCachePath(), cache);
    logger.info({ count: models.length }, "Verifizierter Modellcache gespeichert");
  } catch (err) {
    logger.error({ err }, "Fehler beim Speichern des Modellcaches");
  }

  return cache;
}

export function isCacheValid(cache: ModelsCache | null): boolean {
  if (!cache || cache.version !== CACHE_VERSION) return false;
  const fetched = new Date(cache.fetchedAt).getTime();
  return Number.isFinite(fetched) && Date.now() - fetched < cache.ttlSeconds * 1000;
}

export async function getCachedModels(): Promise<ModelInfo[] | null> {
  const cache = await loadCache();
  return cache && isCacheValid(cache) ? cache.models : null;
}

export function invalidateCache(): void {
  memoryCache = null;
}
