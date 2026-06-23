import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  extractLocalStorage,
} from "./browser.js";

const DEEPSEEK_URL = "https://chat.deepseek.com";
const AUTH_PATTERNS = ["/auth/", "/login", "/signin"];
const COOKIE_NAMES = ["deepseek", "session", "token", "Authorization"];
const TOKEN_KEYS = ["accessToken", "token", "userToken"];

/**
 * DeepSeek-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Cookies und AccessToken extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: DEEPSEEK_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, DEEPSEEK_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const accessToken = await extractLocalStorage(page, TOKEN_KEYS);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const info = await fetchDeepSeekAccountInfo({ cookies, accessToken, userAgent });

    return {
      ok: true,
      session: { cookies, accessToken: accessToken ?? undefined, userAgent },
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

async function fetchDeepSeekAccountInfo(
  session: { cookies: string; accessToken?: string | null; userAgent?: string },
): Promise<ProviderAccountInfo> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": session.userAgent ?? "zero-token/0.1.0",
      Cookie: session.cookies,
    };
    if (session.accessToken) {
      headers["Authorization"] = `Bearer ${session.accessToken}`;
    }
    const response = await fetch("https://chat.deepseek.com/api/v1/user/info", { headers });
    if (!response.ok) return { plan: "unknown" };
    const data = (await response.json()) as Record<string, unknown>;
    return {
      email: typeof data.email === "string" ? data.email : undefined,
      userId: typeof data.id === "string" ? data.id : typeof data.userId === "string" ? data.userId : undefined,
      plan: "free",
    };
  } catch {
    return { plan: "unknown" };
  }
}
