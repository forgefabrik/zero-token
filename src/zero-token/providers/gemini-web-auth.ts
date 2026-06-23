import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  getCookieValue,
} from "./browser.js";

const GEMINI_URL = "https://gemini.google.com";
const AUTH_PATTERNS = ["/auth/", "/signin", "/signup", "/Login"];
const COOKIE_NAMES = ["__Secure-", "SAPISID", "APISID", "HSID", "SSID"];

/**
 * Gemini-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Google-Session-Cookies extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: GEMINI_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, GEMINI_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const sapisid = await getCookieValue(page, "SAPISID");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    const info = await fetchGeminiAccountInfo({ cookies, userAgent });

    return {
      ok: true,
      session: { cookies, accessToken: sapisid, userAgent },
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

async function fetchGeminiAccountInfo(
  session: { cookies: string; userAgent?: string },
): Promise<ProviderAccountInfo> {
  return { plan: "free" };
}
