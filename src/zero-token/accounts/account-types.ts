export type SessionStatus =
  | "unknown"
  | "valid"
  | "expired"
  | "login-required"
  | "error";

export type UsageState =
  | "unknown"
  | "available"
  | "limited"
  | "exhausted"
  | "error";

/** Internal provider keys kept stable for stored account compatibility. */
export type ProviderType =
  | "chatgpt"
  | "claude"
  | "gemini"
  | "deepseek"
  | "grok"
  | "perplexity"
  | "qwen"
  | "qwen-cn"
  | "kimi"
  | "doubao"
  | "glm"
  | "glm-intl"
  | "xiaomimo"
  | "manus";

/** Canonical public provider IDs used by the CLI, model registry and gateway. */
export type ProviderId =
  | "chatgpt-web"
  | "claude-web"
  | "gemini-web"
  | "deepseek-web"
  | "grok-web"
  | "perplexity-web"
  | "qwen-web"
  | "qwen-cn-web"
  | "kimi-web"
  | "doubao-web"
  | "glm-web"
  | "glm-intl-web"
  | "xiaomimo-web"
  | "manus-api";

export type AccountPlan = "plus" | "pro" | "free" | "unknown";

export interface UsageStatus {
  state: UsageState;
  resetAt?: string;
  checkedAt?: string;
  error?: string;
}

export interface ChatGPTPlusAccount {
  id: string;
  label: string;
  provider: ProviderType;

  email?: string;
  userId?: string;
  workspaceId?: string;
  plan?: AccountPlan;

  cookies: string;
  accessToken?: string;
  userAgent?: string;

  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastValidatedAt?: string;

  enabled: boolean;
  priority: number;

  sessionStatus: SessionStatus;

  usageStatus?: UsageStatus;
}

export type AccountExportFormat = "json" | "zip";

export interface ExportAuditRecord {
  id: string;
  createdAt: string;
  accountIds: string[];
  format: AccountExportFormat;
  containsSessionCredentials: boolean;
}
