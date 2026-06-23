import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import type { ModelInfo } from "./model-types.js";
import { getCachedModels, saveCache, invalidateCache } from "./model-cache.js";
import { listAccounts } from "../accounts/account-service.js";
import logger from "../logger.js";

/**
 * Lazy-loaded model discoverers.
 */
const discovererCache = new Map<string, (cookies: string, accessToken: string | undefined, userAgent: string | undefined) => Promise<ModelInfo[]>>();

async function loadDiscoverer(provider: string) {
  if (discovererCache.has(provider)) return discovererCache.get(provider)!;

  try {
    let mod: { discoverModels: typeof discovererCache extends Map<string, infer V> ? V : never };
    switch (provider) {
      case "chatgpt":
        mod = await import("../providers/chatgpt-web-models.js") as any;
        break;
      default:
        discovererCache.set(provider, null as any);
        return null;
    }
    discovererCache.set(provider, mod.discoverModels as any);
    return mod.discoverModels as any;
  } catch {
    discovererCache.set(provider, null as any);
    return null;
  }
}

/**
 * Default model list for providers without a specific discoverer.
 */
function getDefaultModels(provider: string): ModelInfo[] {
  const defaultModels: Record<string, ModelInfo[]> = {
    chatgpt: [
      { id: "gpt-4o", name: "GPT-4o", slug: "gpt-4o", provider: "chatgpt", capabilities: { text: true, vision: true }, enabled: true },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", slug: "gpt-4o-mini", provider: "chatgpt", capabilities: { text: true, vision: true }, enabled: true },
      { id: "o3", name: "o3", slug: "o3", provider: "chatgpt", capabilities: { text: true }, enabled: true },
      { id: "o4-mini", name: "o4-mini", slug: "o4-mini", provider: "chatgpt", capabilities: { text: true }, enabled: true },
      { id: "gpt-4.1", name: "GPT-4.1", slug: "gpt-4.1", provider: "chatgpt", capabilities: { text: true, vision: true }, enabled: true },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", slug: "gpt-4.1-mini", provider: "chatgpt", capabilities: { text: true, vision: true }, enabled: true },
      { id: "gpt-4.1-nano", name: "GPT-4.1 Nano", slug: "gpt-4.1-nano", provider: "chatgpt", capabilities: { text: true, vision: true }, enabled: true },
    ],
    claude: [
      { id: "claude-sonnet-4", name: "Claude Sonnet 4", slug: "claude-sonnet-4", provider: "claude", capabilities: { text: true, vision: true }, enabled: true },
      { id: "claude-haiku-3", name: "Claude Haiku 3", slug: "claude-haiku-3", provider: "claude", capabilities: { text: true, vision: true }, enabled: true },
      { id: "claude-opus-4", name: "Claude Opus 4", slug: "claude-opus-4", provider: "claude", capabilities: { text: true, vision: true }, enabled: true },
    ],
    gemini: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", slug: "gemini-2.5-pro", provider: "gemini", capabilities: { text: true, vision: true }, enabled: true },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", slug: "gemini-2.5-flash", provider: "gemini", capabilities: { text: true, vision: true }, enabled: true },
    ],
    deepseek: [
      { id: "deepseek-chat", name: "DeepSeek Chat", slug: "deepseek-chat", provider: "deepseek", capabilities: { text: true }, enabled: true },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner", slug: "deepseek-reasoner", provider: "deepseek", capabilities: { text: true }, enabled: true },
    ],
    grok: [
      { id: "grok-3", name: "Grok 3", slug: "grok-3", provider: "grok", capabilities: { text: true }, enabled: true },
    ],
    perplexity: [
      { id: "perplexity-sonar-pro", name: "Perplexity Sonar Pro", slug: "perplexity-sonar-pro", provider: "perplexity", capabilities: { text: true }, enabled: true },
    ],
    qwen: [
      { id: "qwen-max", name: "Qwen Max", slug: "qwen-max", provider: "qwen", capabilities: { text: true }, enabled: true },
      { id: "qwen-plus", name: "Qwen Plus", slug: "qwen-plus", provider: "qwen", capabilities: { text: true }, enabled: true },
    ],
    kimi: [
      { id: "kimi-k2", name: "Kimi K2", slug: "kimi-k2", provider: "kimi", capabilities: { text: true }, enabled: true },
    ],
    doubao: [
      { id: "doubao-pro", name: "Doubao Pro", slug: "doubao-pro", provider: "doubao", capabilities: { text: true }, enabled: true },
    ],
    glm: [
      { id: "glm-4-plus", name: "GLM-4 Plus", slug: "glm-4-plus", provider: "glm", capabilities: { text: true }, enabled: true },
    ],
    xiaomimo: [
      { id: "xiaomimo-chat", name: "XiaoMiMo Chat", slug: "xiaomimo-chat", provider: "xiaomimo", capabilities: { text: true }, enabled: true },
    ],
  };

  return defaultModels[provider] ?? [
    { id: `${provider}-default`, name: `${provider} Default`, slug: `${provider}-default`, provider: provider as any, capabilities: { text: true }, enabled: true },
  ];
}

/**
 * Get the list of currently available models.
 * Returns cached models if valid, otherwise triggers a refresh.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const cached = await getCachedModels();
  if (cached) {
    logger.info({ count: cached.length }, "Modelle aus Cache geladen");
    return cached;
  }

  logger.info("Cache ungültig oder leer – aktualisiere Modelle …");
  return refreshModels();
}

/**
 * Refresh the model cache from all active provider accounts.
 */
export async function refreshModels(): Promise<ModelInfo[]> {
  const accounts = await listAccounts();
  const activeAccounts = accounts.filter((a) => a.enabled && a.sessionStatus === "valid");

  if (activeAccounts.length === 0) {
    logger.warn("Keine aktiven Accounts für Modellabfrage gefunden – verwende Defaults");
    const allDefaults: ModelInfo[] = [];
    const providers = ["chatgpt", "claude", "gemini", "deepseek", "grok", "perplexity", "qwen", "kimi", "doubao", "glm", "xiaomimo"];
    for (const p of providers) {
      allDefaults.push(...getDefaultModels(p));
    }
    await saveCache(allDefaults, 300); // 5 min TTL for defaults
    return allDefaults;
  }

  const allModels: ModelInfo[] = [];
  const seenIds = new Set<string>();

  for (const account of activeAccounts) {
    const provider = account.provider ?? "chatgpt";
    const discoverer = await loadDiscoverer(provider);

    if (discoverer) {
      try {
        const models = await discoverer(account.cookies, account.accessToken, account.userAgent);
        for (const m of models) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            allModels.push(m);
          }
        }
        logger.info({ provider, count: models.length }, "Modelle entdeckt");
      } catch (err) {
        logger.error({ provider, err }, "Fehler bei der Modellabfrage");
        // Fallback to defaults for this provider
        for (const m of getDefaultModels(provider)) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            allModels.push(m);
          }
        }
      }
    } else {
      // Use default models for this provider
      for (const m of getDefaultModels(provider)) {
        if (!seenIds.has(m.id)) {
          seenIds.add(m.id);
          allModels.push(m);
        }
      }
    }
  }

  await saveCache(allModels);
  return allModels;
}

/**
 * Get a single model by ID.
 */
export async function getModelById(id: string): Promise<ModelInfo | undefined> {
  const models = await listModels();
  return models.find((m) => m.id === id);
}

/**
 * Get models for a specific provider.
 */
export async function getModelsByProvider(provider: string): Promise<ModelInfo[]> {
  const models = await listModels();
  return models.filter((m) => m.provider === provider);
}
