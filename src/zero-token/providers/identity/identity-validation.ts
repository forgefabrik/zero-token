import type {
  IdentityValidationIssue,
  IdentityValidationResult,
  ProviderIdentity,
  ProviderIdentitySpec,
} from "./provider-identity.js";

function hostMatches(hostname: string, allowedHost: string): boolean {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

export function validateProviderIdentity(
  spec: ProviderIdentitySpec,
  identity: ProviderIdentity,
): IdentityValidationResult {
  const issues: IdentityValidationIssue[] = [];

  if (!identity.userAgent.trim()) {
    issues.push({
      code: "missing-user-agent",
      severity: "error",
      field: "userAgent",
      message: `${spec.provider}: User-Agent fehlt.`,
    });
  }

  if (!identity.origin.trim()) {
    issues.push({
      code: "missing-origin",
      severity: "error",
      field: "origin",
      message: `${spec.provider}: Browser-Origin fehlt.`,
    });
  } else {
    try {
      const hostname = new URL(identity.origin).hostname.toLowerCase();
      if (!spec.allowedHosts.some((allowed) => hostMatches(hostname, allowed))) {
        issues.push({
          code: "origin-host-mismatch",
          severity: "error",
          field: "origin",
          message: `${spec.provider}: Origin ${hostname} gehört nicht zum Providerprofil.`,
        });
      }
    } catch {
      issues.push({
        code: "invalid-origin",
        severity: "error",
        field: "origin",
        message: `${spec.provider}: Browser-Origin ist ungültig.`,
      });
    }
  }

  if (
    spec.requirements.sessionCredential &&
    !identity.accessToken &&
    Object.keys(identity.cookies).length === 0
  ) {
    issues.push({
      code: "missing-session-credential",
      severity: "error",
      field: "sessionCredential",
      message: `${spec.provider}: Keine Session-Credentials verfügbar.`,
    });
  }

  if (spec.requirements.deviceId && !identity.deviceId) {
    issues.push({
      code: "missing-device-id",
      severity: "error",
      field: "deviceId",
      message: `${spec.provider}: Persistente Geräte-ID fehlt.`,
    });
  }

  if (spec.requirements.csrfToken && !identity.csrfToken) {
    issues.push({
      code: "missing-csrf-token",
      severity: "error",
      field: "csrfToken",
      message: `${spec.provider}: CSRF-Token fehlt.`,
    });
  }

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    issues: Object.freeze(issues),
  });
}
