import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  extractLocalStorage,
  getCookieValue,
} from "./browser.js";

const KIMI_URL = "https://kimi.moonshot.cn";
const AUTH_PATTERNS = ["/auth/", "/login", "/signin"];
const COOKIE_NAMES = ["kimi", "session", "refresh_token", "token"];
const TOKEN_KEYS = ["refresh_token", "accessToken", "kimi-token"];

/**
 * Kimi-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Cookies und Refresh-Token extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: KIMI_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, KIMI_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const refreshToken = await extractLocalStorage(page, TOKEN_KEYS);
    const cookieToken = await getCookieValue(page, "refresh_token");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: {
        cookies,
        accessToken: refreshToken ?? cookieToken,
        userAgent,
        extra: { refreshToken: refreshToken ?? cookieToken ?? "" },
      },
      info: { plan: "free" },
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
