import type { ProviderType } from "../accounts/account-types.js";
import type { ModelDiscoverer, ModelInfo } from "./model-types.js";
import { getCachedModels, saveCache } from "./model-cache.js";
import { normalizeDiscoveredModels } from "./model-normalization.js";
import { listAccounts } from "../accounts/account-service.js";
import logger from "../logger.js";

const discovererCache = new Map<ProviderType, ModelDiscoverer | null>();

async function loadDiscoverer(provider: ProviderType): Promise<ModelDiscoverer | null> {
  if (discovererCache.has(provider)) return discovererCache.get(provider) ?? null;

  try {
    let discoverer: ModelDiscoverer | null = null;
    switch (provider) {
      case "chatgpt": {
        const mod = await import("../providers/chatgpt-web-models.js");
        discoverer = mod.discoverModels;
        break;
      }
      default:
        discoverer = null;
    }
    discovererCache.set(provider, discoverer);
    return discoverer;
  } catch (error) {
    logger.error({ provider, error }, "Modelldiscoverer konnte nicht geladen werden");
    discovererCache.set(provider, null);
    return null;
  }
}

/**
 * Returns only models verified against active provider sessions.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const cached = await getCachedModels();
  if (cached) {
    logger.info({ count: cached.length }, "Verifizierte Modelle aus Cache geladen");
    return cached;
  }

  logger.info("Kein gültiger Modellcache – frage aktive Provider ab …");
  return refreshModels();
}

/**
 * Refreshes the cache without speculative or hard-coded fallback models.
 * A failed provider contributes no models until its authenticated discovery
 * succeeds again.
 */
export async function refreshModels(): Promise<ModelInfo[]> {
  const accounts = await listAccounts();
  const activeAccounts = accounts.filter(
    (account) => account.enabled && account.sessionStatus === "valid",
  );

  if (activeAccounts.length === 0) {
    logger.warn("Keine aktiven Accounts – Modellliste bleibt leer");
    await saveCache([], 60);
    return [];
  }

  const allModels = new Map<string, ModelInfo>();
  const accountsByProvider = new Map<ProviderType, typeof activeAccounts>();

  for (const account of activeAccounts) {
    const providerAccounts = accountsByProvider.get(account.provider) ?? [];
    providerAccounts.push(account);
    accountsByProvider.set(account.provider, providerAccounts);
  }

  for (const [provider, providerAccounts] of accountsByProvider) {
    const discoverer = await loadDiscoverer(provider);
    if (!discoverer) {
      logger.warn(
        { provider },
        "Kein verifizierender Modelldiscoverer vorhanden – keine Ersatzmodelle werden veröffentlicht",
      );
      continue;
    }

    let providerSucceeded = false;
    for (const account of providerAccounts) {
      try {
        const discovered = await discoverer(
          account.cookies,
          account.accessToken,
          account.userAgent,
        );
        const verified = normalizeDiscoveredModels(provider, discovered);

        for (const model of verified) {
          allModels.set(`${provider}:${model.id}`, model);
        }

        providerSucceeded = true;
        logger.info(
          { provider, accountId: account.id, count: verified.length },
          "Verifizierte Modelle entdeckt",
        );
      } catch (error) {
        logger.error(
          {
            provider,
            accountId: account.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Verifizierte Modellabfrage fehlgeschlagen",
        );
      }
    }

    if (!providerSucceeded) {
      logger.warn(
        { provider },
        "Provider lieferte keine verifizierte Modellliste und bleibt daher leer",
      );
    }
  }

  const models = [...allModels.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
  );
  await saveCache(models, models.length > 0 ? 3600 : 60);
  return models;
}

export async function getModelById(id: string): Promise<ModelInfo | undefined> {
  const models = await listModels();
  return models.find((model) => model.id === id);
}

export async function getModelsByProvider(provider: string): Promise<ModelInfo[]> {
  const models = await listModels();
  return models.filter((model) => model.provider === provider);
}
