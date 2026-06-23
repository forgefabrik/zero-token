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

export type AccountPlan = "plus" | "unknown";

export interface UsageStatus {
  state: UsageState;
  resetAt?: string;
  checkedAt?: string;
  error?: string;
}

export interface ChatGPTPlusAccount {
  id: string;
  label: string;

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
