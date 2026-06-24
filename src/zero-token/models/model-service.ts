import type { ProviderType } from "../accounts/account-types.js";
import type { ModelDiscoverer, ModelInfo } from "./model-types.js";
import { listAccounts } from "../accounts/account-service.js";
import logger from "../logger.js";
import { getProviderRuntime } from "../providers/provider-runtime-registry.js";
import { getCachedModels, saveCache } from "./model-cache.js";
import { normalizeDiscoveredModels } from "./model-normalization.js";

const discoverers = new Map<ProviderType, ModelDiscoverer | null>();

async function loadDiscoverer(provider: ProviderType): Promise<ModelDiscoverer | null> {
  if (discoverers.has(provider)) return discoverers.get(provider) ?? null;
  const runtime = getProviderRuntime(provider);
  if (!runtime) {
    discoverers.set(provider, null);
    return null;
  }
  try {
    const discoverer = await runtime.loadModelDiscoverer();
    discoverers.set(provider, discoverer);
    return discoverer;
  } catch (error) {
    logger.error({ provider, error }, "Modelldiscoverer konnte nicht geladen werden");
    discoverers.set(provider, null);
    return null;
  }
}

function validateDiscoveredModels(
  provider: ProviderType,
  models: ModelInfo[],
): ModelInfo[] {
  const seen = new Set<string>();

  return models.map((model) => {
    const id = model.id.trim();
    if (!id) {
      throw new Error(`Provider ${provider} lieferte ein Modell ohne ID.`);
    }
    if (model.provider !== provider) {
      throw new Error(
        `Provider ${provider} lieferte Modell ${id} mit falschem Provider ${model.provider}.`,
      );
    }

    const normalizedId = id.toLowerCase();
    if (seen.has(normalizedId)) {
      throw new Error(`Provider ${provider} lieferte Modell ${id} mehrfach.`);
    }
    seen.add(normalizedId);

    return {
      ...model,
      id,
      name: model.name.trim() || id,
      slug: model.slug.trim() || id,
    };
  });
}

export async function listModels(): Promise<ModelInfo[]> {
  const cached = await getCachedModels();
  if (cached) return cached;
  return refreshModels();
}

export async function refreshModels(): Promise<ModelInfo[]> {
  const accounts = (await listAccounts()).filter(
    (account) => account.enabled && account.sessionStatus === "valid",
  );
  if (accounts.length === 0) {
    await saveCache([], 60);
    return [];
  }

  const grouped = new Map<ProviderType, typeof accounts>();
  for (const account of accounts) {
    const list = grouped.get(account.provider) ?? [];
    list.push(account);
    grouped.set(account.provider, list);
  }

  const result = new Map<string, ModelInfo>();
  for (const [provider, providerAccounts] of grouped) {
    const runtime = getProviderRuntime(provider);
    const discoverer = runtime ? await loadDiscoverer(provider) : null;
    if (!runtime || !discoverer) {
      logger.warn({ provider }, "Provider ist noch nicht vollständig ausführbar");
      continue;
    }

    for (const account of providerAccounts) {
      try {
        const models = validateDiscoveredModels(
          provider,
          normalizeDiscoveredModels(
            provider,
            await discoverer(account.cookies, account.accessToken, account.userAgent),
          ),
        );

        for (const model of models) {
          const key = `${provider}:${model.id.toLowerCase()}`;
          const existing = result.get(key);
          if (
            existing &&
            (existing.slug !== model.slug || existing.name !== model.name)
          ) {
            logger.warn(
              {
                provider,
                modelId: model.id,
                firstAccountModel: { name: existing.name, slug: existing.slug },
                accountId: account.id,
                currentAccountModel: { name: model.name, slug: model.slug },
              },
              "Provider-Accounts lieferten unterschiedliche Metadaten für dieselbe Modell-ID",
            );
          }
          result.set(key, model);
        }

        logger.info(
          { provider, accountId: account.id, count: models.length },
          "Verifizierte ausführbare Modelle entdeckt",
        );
      } catch (error) {
        logger.error(
          { provider, accountId: account.id, error: error instanceof Error ? error.message : String(error) },
          "Modellabfrage fehlgeschlagen",
        );
      }
    }
  }

  const models = [...result.values()].sort(
    (a, b) => a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name),
  );
  await saveCache(models, models.length ? 3600 : 60);
  return models;
}

export async function getModelById(id: string): Promise<ModelInfo | undefined> {
  return (await listModels()).find((model) => model.id === id);
}

export async function getModelsByProvider(provider: string): Promise<ModelInfo[]> {
  return (await listModels()).filter((model) => model.provider === provider);
}
