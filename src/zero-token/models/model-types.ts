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
  version: 2;
  fetchedAt: string;
  ttlSeconds: number;
  models: ModelInfo[];
}

/**
 * Provider-specific model discovery function.
 * Fetches only models actually available to the authenticated account.
 */
export type ModelDiscoverer = (
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
) => Promise<ModelInfo[]>;
