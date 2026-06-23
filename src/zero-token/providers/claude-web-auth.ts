import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  getCookieValue,
} from "./browser.js";

const CLAUDE_URL = "https://claude.ai";
const AUTH_PATTERNS = ["/auth/", "/login", "/signup"];
const COOKIE_NAMES = ["sessionKey", "__Host-session"];

/**
 * Claude-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * sessionKey-Cookie extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: CLAUDE_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, CLAUDE_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const sessionKey = await getCookieValue(page, "sessionKey");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const info = await fetchClaudeAccountInfo({ cookies, accessToken: sessionKey, userAgent });

    return {
      ok: true,
      session: {
        cookies,
        accessToken: sessionKey,
        userAgent,
        extra: { sessionKey: sessionKey ?? "" },
      },
      info,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Login nicht innerhalb")) return { ok: false, reason: "login-timeout" };
    if (msg.includes("Browser konnte nicht geöffnet")) return { ok: false, reason: "browser-launch-failed" };
    return { ok: false, reason: "unknown-error" };
  } finally {
    if (browserInstance) await browserInstance.close().catch(() => {});
  }
};

async function fetchClaudeAccountInfo(
  session: { cookies: string; accessToken?: string; userAgent?: string },
): Promise<ProviderAccountInfo> {
  try {
    const response = await fetch("https://claude.ai/api/auth/session", {
      headers: {
        Accept: "application/json",
        "User-Agent": session.userAgent ?? "zero-token/0.1.0",
        Cookie: session.cookies,
        ...(session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      },
    });
    if (!response.ok) return { plan: "unknown" };
    const data = (await response.json()) as Record<string, unknown>;
    return {
      email: typeof data.email === "string" ? data.email : undefined,
      userId: typeof data.id === "string" ? data.id : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      plan: (data.plan as string) === "pro" ? "pro" : (data.plan as string) === "plus" ? "plus" : "unknown",
    };
  } catch {
    return { plan: "unknown" };
  }
}
