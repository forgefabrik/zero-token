import type { ProviderType } from "../accounts/account-types.js";

export interface ModelCapabilities {
  text?: boolean;
  vision?: boolean;
  voice?: boolean;
  plugins?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  slug: string;
  provider: ProviderType;
  capabilities: ModelCapabilities;
  maxTokens?: number;
  enabled: boolean;
}

export interface ModelsCache {
  fetchedAt: string;
  ttlSeconds: number;
  models: ModelInfo[];
}

/**
 * Provider-specific model discovery function.
 * Fetches available models for a given provider using stored session credentials.
 */
export type ModelDiscoverer = (
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
) => Promise<ModelInfo[]>;
