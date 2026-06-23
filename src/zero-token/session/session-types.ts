import type { SessionStatus, AccountPlan, ProviderType } from "../accounts/account-types.js";

/**
 * Result of validating a stored provider session.
 */
export interface SessionValidationResult {
  accountId: string;
  provider: ProviderType;
  valid: boolean;
  status: SessionStatus;
  userId?: string;
  email?: string;
  name?: string;
  plan?: AccountPlan;
  expiresAt?: string;
  error?: string;
}

/**
 * Provider-specific session validation function.
 * Returns null if validation can't be performed (e.g. network error).
 */
export type SessionValidator = (
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
) => Promise<SessionValidationResult>;
