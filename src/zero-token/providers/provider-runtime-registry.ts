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
      const module = await import("../inference/chatgpt-browser-provider.js");
      return new module.ChatGPTBrowserProvider(accountId);
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
