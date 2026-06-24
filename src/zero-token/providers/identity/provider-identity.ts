import type { ProviderType } from "../../accounts/account-types.js";

export type IdentityValueSource =
  | "header"
  | "cookie"
  | "localStorage"
  | "sessionStorage";

export interface BrowserCookieSnapshot {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export interface BrowserIdentitySnapshot {
  cookies: readonly BrowserCookieSnapshot[];
  localStorage: Readonly<Record<string, string>>;
  sessionStorage: Readonly<Record<string, string>>;
  headers: Readonly<Record<string, string>>;
  userAgent: string;
  origin: string;
  referer?: string;
  capturedAt: string;
}

export interface ProviderIdentity {
  provider: ProviderType;
  cookies: Readonly<Record<string, string>>;
  localStorage: Readonly<Record<string, string>>;
  sessionStorage: Readonly<Record<string, string>>;
  accessToken?: string;
  refreshToken?: string;
  deviceId?: string;
  csrfToken?: string;
  userAgent: string;
  origin: string;
  referer?: string;
  capturedAt: string;
  source: "browser-profile";
}

export interface IdentityCandidate {
  source: IdentityValueSource;
  key: string;
  stripBearerPrefix?: boolean;
}

export interface ProviderIdentityRequirements {
  sessionCredential: boolean;
  deviceId: boolean;
  csrfToken: boolean;
}

export interface ProviderIdentitySpec {
  provider: ProviderType;
  allowedHosts: readonly string[];
  sessionCookieNames: readonly string[];
  accessTokenCandidates: readonly IdentityCandidate[];
  refreshTokenCandidates: readonly IdentityCandidate[];
  deviceIdCandidates: readonly IdentityCandidate[];
  csrfTokenCandidates: readonly IdentityCandidate[];
  requirements: ProviderIdentityRequirements;
}

export type IdentityIssueSeverity = "error" | "warning";

export interface IdentityValidationIssue {
  code:
    | "missing-user-agent"
    | "missing-origin"
    | "invalid-origin"
    | "origin-host-mismatch"
    | "missing-session-credential"
    | "missing-device-id"
    | "missing-csrf-token";
  severity: IdentityIssueSeverity;
  field:
    | "userAgent"
    | "origin"
    | "sessionCredential"
    | "deviceId"
    | "csrfToken";
  message: string;
}

export interface IdentityValidationResult {
  valid: boolean;
  issues: readonly IdentityValidationIssue[];
}

export interface ProviderIdentityResolution {
  identity: ProviderIdentity;
  validation: IdentityValidationResult;
}

export interface ProviderIdentitySummary {
  provider: ProviderType;
  cookieNames: readonly string[];
  localStorageKeys: readonly string[];
  sessionStorageKeys: readonly string[];
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  hasDeviceId: boolean;
  hasCsrfToken: boolean;
  userAgentPresent: boolean;
  origin: string;
  refererPresent: boolean;
  capturedAt: string;
}

export function summarizeProviderIdentity(
  identity: ProviderIdentity,
): ProviderIdentitySummary {
  return Object.freeze({
    provider: identity.provider,
    cookieNames: Object.freeze(Object.keys(identity.cookies).sort()),
    localStorageKeys: Object.freeze(Object.keys(identity.localStorage).sort()),
    sessionStorageKeys: Object.freeze(Object.keys(identity.sessionStorage).sort()),
    hasAccessToken: Boolean(identity.accessToken),
    hasRefreshToken: Boolean(identity.refreshToken),
    hasDeviceId: Boolean(identity.deviceId),
    hasCsrfToken: Boolean(identity.csrfToken),
    userAgentPresent: Boolean(identity.userAgent),
    origin: identity.origin,
    refererPresent: Boolean(identity.referer),
    capturedAt: identity.capturedAt,
  });
}
