// ---------------------------------------------------------------------------
// API Client – spricht mit der Admin-API des Zero-Token-Gateways
// ---------------------------------------------------------------------------

const BASE = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export interface SystemStatus {
  accounts: number;
  validSessions: number;
  models: number;
  timestamp: string;
}

export function getStatus(): Promise<SystemStatus> {
  return request<SystemStatus>("/status");
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export interface Account {
  id: string;
  label: string;
  provider: string;
  email?: string;
  plan?: string;
  sessionStatus: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  lastUsedAt?: string;
  cookiesPresent: boolean;
  hasAccessToken: boolean;
  usageStatus?: { state: string; resetAt?: string };
}

export interface SessionValidationResult {
  accountId: string;
  provider: string;
  valid: boolean;
  status: string;
  email?: string;
  plan?: string;
  error?: string;
}

export function listAccounts(): Promise<Account[]> {
  return request<Account[]>("/accounts");
}

export function getAccount(id: string): Promise<Account> {
  return request<Account>(`/accounts/${id}`);
}

export function deleteAccount(id: string): Promise<{ success: boolean }> {
  return request(`/accounts/${id}`, { method: "DELETE" });
}

export function validateAccount(id: string): Promise<SessionValidationResult> {
  return request<SessionValidationResult>(`/accounts/${id}/validate`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface Model {
  id: string;
  name: string;
  slug: string;
  provider: string;
  capabilities: Record<string, boolean>;
  enabled: boolean;
}

export interface RefreshResult {
  count: number;
  models: Model[];
}

export function getModels(): Promise<Model[]> {
  return request<Model[]>("/models");
}

export function refreshModels(): Promise<RefreshResult> {
  return request<RefreshResult>("/models/refresh", { method: "POST" });
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface GatewayConfig {
  host: string;
  port: number;
  logLevel: string;
  cors: boolean;
}

export interface ProxyScope {
  protocol: string;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export interface ScopedProxyConfig {
  global?: ProxyScope;
  login?: ProxyScope;
  gateway?: ProxyScope;
}

export interface AppConfig {
  gateway: GatewayConfig;
  defaultPriority: number;
  selectionStrategy: string;
  modelsCacheTTL: number;
  proxy?: ScopedProxyConfig;
  ui: { enabled: boolean; port: number };
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/config");
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface Health {
  status: string;
  timestamp: string;
}

export function getHealth(): Promise<Health> {
  return fetch("/health").then((r) => {
    if (!r.ok) throw new Error(`Health-Check fehlgeschlagen (HTTP ${r.status})`);
    return r.json();
  });
}
