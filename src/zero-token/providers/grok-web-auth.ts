import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  extractLocalStorage,
} from "./browser.js";

const GROK_URL = "https://grok.com";
const AUTH_PATTERNS = ["/auth/", "/login", "/signin"];
const COOKIE_NAMES = ["grok", "session", "token", "x-auth-token"];
const TOKEN_KEYS = ["accessToken", "authToken", "grokToken"];

/**
 * Grok-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Cookies und Auth-Token extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: GROK_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, GROK_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const accessToken = await extractLocalStorage(page, TOKEN_KEYS);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: { cookies, accessToken: accessToken ?? undefined, userAgent },
      info: await fetchGrokAccountInfo({ cookies, accessToken, userAgent }),
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

async function fetchGrokAccountInfo(
  session: { cookies: string; accessToken?: string | null; userAgent?: string },
): Promise<ProviderAccountInfo> {
  return { plan: "free" };
}
