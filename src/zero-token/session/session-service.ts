import type { ChatGPTPlusAccount, SessionStatus } from "../accounts/account-types.js";
import type { SessionValidationResult, SessionValidator } from "./session-types.js";
import { getAccount, saveAccount } from "../accounts/account-repository.js";
import logger from "../logger.js";

/**
 * Lazy-loaded validator cache.
 */
const validatorCache = new Map<string, SessionValidator | null>();

async function loadValidator(provider: string): Promise<SessionValidator | null> {
  if (validatorCache.has(provider)) {
    return validatorCache.get(provider)!;
  }

  try {
    let mod: { validateSession: SessionValidator };
    switch (provider) {
      case "chatgpt":
        mod = await import("../providers/chatgpt-web-validator.js");
        break;
      case "claude":
        mod = await import("../providers/claude-web-validator.js");
        break;
      case "deepseek":
        mod = await import("../providers/deepseek-web-validator.js");
        break;
      case "perplexity":
        mod = await import("../providers/perplexity-web-validator.js");
        break;
      default:
        validatorCache.set(provider, null);
        return null;
    }
    validatorCache.set(provider, mod.validateSession);
    return mod.validateSession;
  } catch {
    validatorCache.set(provider, null);
    return null;
  }
}

/**
 * Basic fallback validator: fetches the provider's homepage and checks
 * if the cookies are accepted (no redirect to login).
 * This is less reliable but works for providers without a specific API.
 */
async function fallbackValidate(
  provider: string,
  loginUrl: string,
  cookies: string,
  userAgent: string | undefined,
): Promise<SessionValidationResult> {
  try {
    const response = await fetch(loginUrl, {
      headers: {
        "User-Agent": userAgent ?? "zero-token/0.1.0",
        Cookie: cookies,
      },
      redirect: "manual",
    });

    // If we get a redirect (302) to a login page, session is expired
    if (response.status === 302 || response.status === 301) {
      const location = response.headers.get("location") ?? "";
      if (location.includes("login") || location.includes("auth") || location.includes("signin")) {
        return {
          accountId: "",
          provider: provider as ChatGPTPlusAccount["provider"],
          valid: false,
          status: "expired",
          error: "Weiterleitung zur Login-Seite",
        };
      }
    }

    // 200 means cookies are accepted → session likely valid
    if (response.ok) {
      return {
        accountId: "",
        provider: provider as ChatGPTPlusAccount["provider"],
        valid: true,
        status: "valid",
      };
    }

    return {
      accountId: "",
      provider: provider as ChatGPTPlusAccount["provider"],
      valid: false,
      status: "error",
      error: `HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      accountId: "",
      provider: provider as ChatGPTPlusAccount["provider"],
      valid: false,
      status: "error",
      error: `Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

const PROVIDER_LOGIN_URLS: Record<string, string> = {
  chatgpt: "https://chatgpt.com",
  claude: "https://claude.ai",
  gemini: "https://gemini.google.com",
  deepseek: "https://chat.deepseek.com",
  grok: "https://grok.com",
  perplexity: "https://www.perplexity.ai",
  qwen: "https://chat.qwen.ai",
  kimi: "https://kimi.moonshot.cn",
  doubao: "https://www.doubao.com",
  glm: "https://chatglm.cn",
  xiaomimo: "https://xiaomimo.com",
};

/**
 * Validate a single account's session.
 */
export async function validateAccountSession(
  account: ChatGPTPlusAccount,
): Promise<SessionValidationResult> {
  const provider = account.provider ?? "chatgpt";

  const validator = await loadValidator(provider);

  let result: SessionValidationResult;

  if (validator) {
    result = await validator(account.cookies, account.accessToken, account.userAgent);
  } else {
    const loginUrl = PROVIDER_LOGIN_URLS[provider] ?? `https://${provider}.com`;
    result = await fallbackValidate(provider, loginUrl, account.cookies, account.userAgent);
  }

  // Update the account with validation result
  result.accountId = account.id;
  const newStatus: SessionStatus = result.valid ? "valid" : "expired";

  try {
    const existing = await getAccount(account.id);
    if (existing) {
      await saveAccount({
        ...existing,
        sessionStatus: newStatus,
        lastValidatedAt: new Date().toISOString(),
        ...(result.email && { email: result.email }),
        ...(result.userId && { userId: result.userId }),
        ...(result.plan && { plan: result.plan }),
      });
    }
  } catch (err) {
    logger.error({ accountId: account.id, err }, "Fehler beim Aktualisieren des Account-Status");
  }

  logger.info(
    { accountId: account.id, provider, valid: result.valid, status: result.status },
    "Session validiert",
  );

  return result;
}

/**
 * Validate all stored accounts. Returns per-account results.
 */
export async function validateAllSessions(): Promise<SessionValidationResult[]> {
  const { listAccounts } = await import("../accounts/account-service.js");
  const accounts = await listAccounts();

  if (accounts.length === 0) {
    logger.info("Keine Accounts zum Validieren gefunden.");
    return [];
  }

  logger.info({ count: accounts.length }, "Validiere alle Accounts …");

  const results: SessionValidationResult[] = [];
  for (const account of accounts) {
    if (!account.enabled) {
      results.push({
        accountId: account.id,
        provider: account.provider ?? "chatgpt",
        valid: false,
        status: account.sessionStatus,
        error: "Account deaktiviert",
      });
      continue;
    }
    const result = await validateAccountSession(account);
    results.push(result);
  }

  return results;
}
