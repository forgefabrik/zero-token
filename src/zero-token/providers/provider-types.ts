import type { ProviderId, ProviderType } from "../accounts/account-types.js";

/**
 * Browser launch/connection configuration shared by all providers.
 */
export interface ProviderBrowserConfig {
  /** CDP remote port (e.g. 9222). If set, connects to existing Chrome. */
  cdpPort?: number;
  /** Timeout for waiting on login, in ms (default: 300000 = 5 min) */
  loginTimeout?: number;
  /** Optional proxy URL for the browser */
  proxy?: string;
  /** Whether to show the browser window (default: true for login) */
  headless?: boolean;
}

/**
 * Credentials extracted after a successful web login.
 * Each provider stores/uses these differently.
 */
export interface ProviderSessionData {
  cookies: string;
  accessToken?: string;
  userAgent?: string;
  /** Provider-specific extra data (e.g. sessionKey for Claude) */
  extra?: Record<string, string>;
}

/**
 * Minimal account info returned from provider API after login.
 */
export interface ProviderAccountInfo {
  email?: string;
  userId?: string;
  name?: string;
  plan: "plus" | "pro" | "free" | "unknown";
}

/**
 * Standardised login result across all providers.
 */
export type ProviderLoginResult =
  | { ok: true; session: ProviderSessionData; info: ProviderAccountInfo }
  | { ok: false; reason: ProviderLoginFailureReason };

export type ProviderLoginFailureReason =
  | "browser-launch-failed"
  | "login-timeout"
  | "plan-not-supported"
  | "session-extraction-failed"
  | "configuration-required"
  | "unknown-provider"
  | "user-cancelled"
  | "unknown-error";

/**
 * Descriptor for a registered provider.
 */
export interface ProviderDescriptor {
  /** Canonical public ID, e.g. chatgpt-web. */
  id: ProviderId;
  /** Stable internal key used in persisted account records. */
  implementation: ProviderType;
  /** Backwards-compatible CLI/config aliases. */
  aliases: readonly string[];
  label: string;
  /** URL the browser should open for login or API-key management. */
  loginUrl: string;
  /** Whether this provider requires a specific plan (e.g. ChatGPT Plus). */
  requiredPlan?: "plus" | "pro";
  authType: "web-login" | "api-key";
  /** Color for UI display (hex). */
  color: string;
}

/**
 * Auth function signature: open browser, wait for login, extract credentials.
 */
export type ProviderAuthFunction = (
  config: ProviderBrowserConfig,
) => Promise<ProviderLoginResult>;
