import type { ProviderType } from "../../accounts/account-types.js";

export interface ProviderIdentitySignals {
  provider: ProviderType;
  origin: string;
  userAgentPresent: boolean;
  accountSessionPresent: boolean;
  deviceBindingPresent: boolean;
  requestProtectionPresent: boolean;
}

export interface ProviderIdentityReadiness {
  provider: ProviderType;
  ready: boolean;
  missing: readonly string[];
}

interface ProviderIdentityRule {
  allowedHosts: readonly string[];
  requireDeviceBinding: boolean;
  requireRequestProtection: boolean;
}

const RULES: Partial<Record<ProviderType, ProviderIdentityRule>> = {
  chatgpt: {
    allowedHosts: ["chatgpt.com"],
    requireDeviceBinding: false,
    requireRequestProtection: false,
  },
  claude: {
    allowedHosts: ["claude.ai"],
    requireDeviceBinding: true,
    requireRequestProtection: false,
  },
  qwen: {
    allowedHosts: ["chat.qwen.ai"],
    requireDeviceBinding: false,
    requireRequestProtection: false,
  },
  glm: {
    allowedHosts: ["chatglm.cn"],
    requireDeviceBinding: true,
    requireRequestProtection: false,
  },
};

function matchesAllowedHost(origin: string, allowedHosts: readonly string[]): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return allowedHosts.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`),
    );
  } catch {
    return false;
  }
}

export function evaluateProviderIdentityReadiness(
  signals: ProviderIdentitySignals,
): ProviderIdentityReadiness {
  const rule = RULES[signals.provider];
  const missing: string[] = [];

  if (!rule) missing.push("provider-rule");
  if (!signals.userAgentPresent) missing.push("user-agent");
  if (!signals.accountSessionPresent) missing.push("account-session");
  if (!rule || !matchesAllowedHost(signals.origin, rule.allowedHosts)) {
    missing.push("provider-origin");
  }
  if (rule?.requireDeviceBinding && !signals.deviceBindingPresent) {
    missing.push("device-binding");
  }
  if (rule?.requireRequestProtection && !signals.requestProtectionPresent) {
    missing.push("request-protection");
  }

  return Object.freeze({
    provider: signals.provider,
    ready: missing.length === 0,
    missing: Object.freeze(missing),
  });
}
