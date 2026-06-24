import type { ProviderIdentitySpec } from "./provider-identity.js";

export const CHATGPT_IDENTITY_SPEC = Object.freeze({
  provider: "chatgpt",
  allowedHosts: ["chatgpt.com"],
  sessionCookieNames: [],
  accessTokenCandidates: [],
  refreshTokenCandidates: [],
  deviceIdCandidates: [],
  csrfTokenCandidates: [],
  requirements: {
    sessionCredential: true,
    deviceId: false,
    csrfToken: false,
  },
} satisfies ProviderIdentitySpec);
