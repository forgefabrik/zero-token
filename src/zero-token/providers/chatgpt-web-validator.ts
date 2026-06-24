import type { SessionValidationResult } from "../session/session-types.js";
import { getProviderBrowserPage } from "./remote-browser-session.js";
import { detectChatGptPlan } from "./chatgpt-web-auth.js";

/**
 * Validates ChatGPT inside the persistent authenticated browser profile.
 * Stored cookie strings are intentionally not replayed from Node because the
 * web session can be bound to the real browser context.
 */
export async function validateSession(
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
): Promise<SessionValidationResult> {
  void cookies;
  void accessToken;
  void userAgent;

  try {
    const page = await getProviderBrowserPage("https://chatgpt.com/");
    await page.goto("https://chatgpt.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    const result = await page.evaluate(async () => {
      const response = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      return {
        status: response.status,
        body: response.ok ? await response.json() : undefined,
      };
    });

    if (result.status === 401 || result.status === 403) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "expired",
        error: `Browser-Session antwortete mit HTTP ${result.status}`,
      };
    }

    if (result.status < 200 || result.status >= 300 || !result.body) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "error",
        error: `Browser-Sessionprüfung antwortete mit HTTP ${result.status}`,
      };
    }

    const data = result.body as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | undefined;
    if (!user) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "expired",
        error: "Im Browser wurde kein angemeldeter Benutzer erkannt.",
      };
    }

    return {
      accountId: "",
      provider: "chatgpt",
      valid: true,
      status: "valid",
      userId: typeof user.id === "string" ? user.id : undefined,
      email: typeof user.email === "string" ? user.email : undefined,
      name: typeof user.name === "string" ? user.name : undefined,
      plan: detectChatGptPlan(data),
      expiresAt: typeof data.expires === "string" ? data.expires : undefined,
    };
  } catch (error) {
    return {
      accountId: "",
      provider: "chatgpt",
      valid: false,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
