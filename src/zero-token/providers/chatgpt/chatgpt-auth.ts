import type { ChatGPTBrowserConfig, LoginResult } from "./chatgpt-types.js";
import type { ProviderBrowserConfig } from "../provider-types.js";
import { login as registryLogin } from "../registry.js";
import { createAccount, updateAccount } from "../../accounts/account-service.js";
import logger from "../../logger.js";

/**
 * Führt den vollständigen ChatGPT-Plus-Login durch.
 *
 * Dies ist ein Legacy-Wrapper um das neue provider-agnostische Login-System.
 * Bei Erfolg wird der Account lokal gespeichert.
 */
export async function login(
  config: ChatGPTBrowserConfig = {},
): Promise<LoginResult> {
  try {
    const providerConfig: ProviderBrowserConfig = {
      cdpPort: config.cdpPort,
      loginTimeout: config.loginTimeout,
      proxy: config.proxy,
      headless: config.headless,
    };

    const result = await registryLogin("chatgpt", providerConfig);

    if (!result.ok) {
      return { ok: false, reason: mapFailure(result.reason) };
    }

    // Account speichern
    const label = result.info.email
      ? result.info.email.split("@")[0]
      : "ChatGPT Plus";
    const account = await createAccount(label, "chatgpt");
    await updateAccount(account.id, {
      email: result.info.email,
      userId: result.info.userId,
      plan: result.info.plan === "plus" ? "plus" : "unknown",
      cookies: result.session.cookies,
      accessToken: result.session.accessToken,
      userAgent: result.session.userAgent,
      sessionStatus: "valid",
      lastValidatedAt: new Date().toISOString(),
    });

    logger.info({ accountId: account.id }, "Account erfolgreich gespeichert.");

    return {
      ok: true,
      session: {
        cookies: result.session.cookies,
        accessToken: result.session.accessToken,
        userAgent: result.session.userAgent,
      },
      info: {
        email: result.info.email,
        userId: result.info.userId,
        name: result.info.name,
        plan: result.info.plan === "plus" ? "plus" : "unknown",
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Login fehlgeschlagen.");

    if (message.includes("Browser konnte nicht geöffnet")) {
      return { ok: false, reason: "browser-launch-failed" };
    }
    if (message.includes("Login nicht innerhalb")) {
      return { ok: false, reason: "login-timeout" };
    }

    return { ok: false, reason: "unknown-error" };
  }
}

function mapFailure(
  reason: string,
): "browser-launch-failed" | "login-timeout" | "not-plus-account" | "session-extraction-failed" | "user-cancelled" | "unknown-error" {
  switch (reason) {
    case "browser-launch-failed":
      return "browser-launch-failed";
    case "login-timeout":
      return "login-timeout";
    case "plan-not-supported":
      return "not-plus-account";
    case "session-extraction-failed":
      return "session-extraction-failed";
    case "user-cancelled":
      return "user-cancelled";
    default:
      return "unknown-error";
  }
}
