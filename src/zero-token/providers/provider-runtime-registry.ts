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
      const module = await import("../inference/chatgpt-openclaw-provider.js");
      return new module.ChatGPTOpenClawProvider(accountId);
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
      const module = await import("../inference/claude-browser-provider.js");
      return new module.ClaudeBrowserProvider(accountId);
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

export function getProviderRuntime(
  provider: ProviderType,
): ProviderRuntimeAdapter | undefined {
  return RUNTIME_ADAPTERS[provider];
}

export function listRunnableProviders(): ProviderType[] {
  return Object.keys(RUNTIME_ADAPTERS) as ProviderType[];
}

export function isRunnableProvider(provider: ProviderType): boolean {
  return Boolean(getProviderRuntime(provider));
}
