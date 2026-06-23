import type { ProviderType } from "../accounts/account-types.js";
import { configFilePath } from "./paths.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import logger from "../logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  host: string;
  port: number;
  logLevel: string;
  cors: boolean;
}

export interface ProxyConfig {
  protocol: "http" | "https" | "socks5" | "socks5h";
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ScopedProxyConfig {
  global?: ProxyConfig;
  login?: ProxyConfig;
  gateway?: ProxyConfig;
  "session-validation"?: ProxyConfig;
}

export type SelectionStrategy = "priority" | "round-robin";

export interface ZeroTokenConfig {
  gateway: GatewayConfig;
  defaultPriority: number;
  selectionStrategy: SelectionStrategy;
  modelsCacheTTL: number;
  proxy?: ScopedProxyConfig;
  ui: {
    enabled: boolean;
    port: number;
  };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS: ZeroTokenConfig = {
  gateway: {
    host: "127.0.0.1",
    port: 3000,
    logLevel: "info",
    cors: true,
  },
  defaultPriority: 100,
  selectionStrategy: "priority",
  modelsCacheTTL: 3600,
  ui: {
    enabled: true,
    port: 5173,
  },
};

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

let cachedConfig: ZeroTokenConfig | null = null;

/**
 * Load configuration from disk, merging with defaults.
 */
export async function loadConfig(): Promise<ZeroTokenConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const stored = await readStored<ZeroTokenConfig>(configFilePath());
    if (stored) {
      cachedConfig = { ...DEFAULTS, ...stored, gateway: { ...DEFAULTS.gateway, ...stored.gateway } };
      return cachedConfig;
    }
  } catch (err) {
    logger.warn({ err }, "Konnte config.json nicht lesen, verwende Defaults");
  }

  cachedConfig = { ...DEFAULTS };
  return cachedConfig;
}

/**
 * Save configuration to disk.
 */
export async function saveConfig(config: ZeroTokenConfig): Promise<void> {
  cachedConfig = config;
  await writeStored(configFilePath(), config);
  logger.info("config.json gespeichert");
}

/**
 * Get a single config value (with dot-path support).
 */
export async function getConfigValue<T>(key: string): Promise<T | undefined> {
  const config = await loadConfig();
  const keys = key.split(".");
  let value: any = config;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return undefined;
    }
  }
  return value as T;
}

/**
 * Update a single config value (with dot-path support).
 */
export async function setConfigValue(key: string, value: unknown): Promise<void> {
  const config = await loadConfig();
  const keys = key.split(".");
  let target: any = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!(keys[i] in target)) target[keys[i]] = {};
    target = target[keys[i]];
  }
  target[keys[keys.length - 1]] = value;
  await saveConfig(config);
}

/**
 * Get proxy config for a specific scope.
 */
export async function getProxyForScope(
  scope: keyof ScopedProxyConfig,
): Promise<ProxyConfig | undefined> {
  const config = await loadConfig();
  return config.proxy?.[scope];
}

/**
 * Invalidate config cache (force reload from disk).
 */
export function invalidateConfigCache(): void {
  cachedConfig = null;
}
