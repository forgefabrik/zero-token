import type { ProviderType } from "../accounts/account-types.js";
import type { InferenceProvider } from "../inference/inference-provider.js";
import type { ModelDiscoverer } from "../models/model-types.js";

export interface ProviderRuntimeAdapter {
  provider: ProviderType;
  publicApiId: string;
  loadModelDiscoverer: () => Promise<ModelDiscoverer>;
  createInferenceProvider: (accountId?: string) => Promise<InferenceProvider>;
}

const RUNTIME_ADAPTERS: Partial<Record<ProviderType, ProviderRuntimeAdapter>> = {
  chatgpt: {
    provider: "chatgpt",
    publicApiId: "chatgpt-web",
    loadModelDiscoverer: async () => {
      const module = await import("./chatgpt-web-models.js");
      return module.discoverModels;
    },
    createInferenceProvider: async (accountId?: string) => {
      const module = await import("../inference/chatgpt-direct-provider.js");
      return new module.ChatGPTDirectProvider(accountId);
    },
  },
  claude: {
    provider: "claude",
    publicApiId: "claude-web",
    loadModelDiscoverer: async () => {
      const module = await import("./claude-web-models.js");
      return module.discoverModels;
    },
    createInferenceProvider: async (accountId?: string) => {
      const module = await import("../inference/claude-openclaw-provider.js");
      return new module.ClaudeOpenClawProvider(accountId);
    },
  },
  qwen: {
    provider: "qwen",
    publicApiId: "qwen-web",
    loadModelDiscoverer: async () => {
      const module = await import("./qwen-web-models.js");
      return module.discoverModels;
    },
    createInferenceProvider: async (accountId?: string) => {
      const module = await import("../inference/qwen-browser-provider.js");
      return new module.QwenBrowserProvider(accountId);
    },
  },
  glm: {
    provider: "glm",
    publicApiId: "glm-web",
    loadModelDiscoverer: async () => {
      const module = await import("./glm-web-models.js");
      return module.discoverModels;
    },
    createInferenceProvider: async (accountId?: string) => {
      const module = await import("../inference/glm-browser-provider.js");
      return new module.GlmBrowserProvider(accountId);
    },
  },
};

function normalizePublicApiId(publicApiId: string): string {
  const normalized = publicApiId.trim().toLowerCase();
  if (!normalized) throw new Error("Öffentliche Provider-ID darf nicht leer sein.");
  return normalized;
}

const RUNTIMES = Object.freeze(
  Object.values(RUNTIME_ADAPTERS).filter(
    (adapter): adapter is ProviderRuntimeAdapter => adapter !== undefined,
  ),
);

const RUNTIME_BY_PUBLIC_API_ID = new Map<string, ProviderRuntimeAdapter>();
for (const runtime of RUNTIMES) {
  const publicApiId = normalizePublicApiId(runtime.publicApiId);
  if (RUNTIME_BY_PUBLIC_API_ID.has(publicApiId)) {
    throw new Error(`Doppelte öffentliche Provider-ID: ${publicApiId}`);
  }
  RUNTIME_BY_PUBLIC_API_ID.set(publicApiId, runtime);
}

export function getProviderRuntime(
  provider: ProviderType,
): ProviderRuntimeAdapter | undefined {
  return RUNTIME_ADAPTERS[provider];
}

export function requireProviderRuntime(
  provider: ProviderType,
): ProviderRuntimeAdapter {
  const runtime = getProviderRuntime(provider);
  if (!runtime) {
    throw new Error(`Provider besitzt keine ausführbare Runtime: ${provider}`);
  }
  return runtime;
}

export function getProviderRuntimeByPublicApiId(
  publicApiId: string,
): ProviderRuntimeAdapter | undefined {
  return RUNTIME_BY_PUBLIC_API_ID.get(normalizePublicApiId(publicApiId));
}

export function listProviderRuntimes(): readonly ProviderRuntimeAdapter[] {
  return RUNTIMES;
}

export function listRunnableProviders(): ProviderType[] {
  return RUNTIMES.map((runtime) => runtime.provider);
}

export function isRunnableProvider(provider: ProviderType): boolean {
  return Boolean(getProviderRuntime(provider));
}
