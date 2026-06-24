import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  extractLocalStorage,
} from "./browser.js";

const QWEN_URL = "https://chat.qwen.ai";
const AUTH_PATTERNS = ["/auth/", "/login", "/signin"];
const COOKIE_NAMES = ["qwen", "session", "token", "Authorization"];
const TOKEN_KEYS = ["accessToken", "qwen-token", "userToken"];

async function waitForQwenSession(
  page: Parameters<typeof extractCookies>[0],
  timeout: number,
): Promise<{ cookies: string; accessToken?: string }> {
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const cookies = await extractCookies(page, COOKIE_NAMES);
    const accessToken = await extractLocalStorage(page, TOKEN_KEYS);
    if (cookies.trim() || accessToken?.trim()) {
      return {
        cookies,
        accessToken: accessToken?.trim() || undefined,
      };
    }
    await page.waitForTimeout(1_000);
  }

  throw new Error("Qwen-Login erkannt, aber Sessiondaten wurden nicht gesetzt.");
}

export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: QWEN_URL,
      cdpUrl: config.cdpUrl,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    const timeout = config.loginTimeout ?? 300_000;
    await waitForUrlLogin(page, QWEN_URL, AUTH_PATTERNS, timeout);
    const { cookies, accessToken } = await waitForQwenSession(page, timeout);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: { cookies, accessToken, userAgent },
      info: await fetchQwenAccountInfo({ cookies, userAgent }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Login nicht innerhalb")) return { ok: false, reason: "login-timeout" };
    if (msg.includes("Sessiondaten wurden nicht gesetzt")) {
      return { ok: false, reason: "session-extraction-failed" };
    }
    if (msg.includes("Browser konnte nicht geöffnet")) return { ok: false, reason: "browser-launch-failed" };
    return { ok: false, reason: "unknown-error" };
  } finally {
    // Bei CDP gehört Chromium dem gemeinsamen Remote-Browser. Die Verbindung
    // darf nach dem Login nicht geschlossen werden, sonst verschwinden Session
    // und spätere Modell-/Stream-Abfragen.
    if (browserInstance && !config.cdpUrl) {
      await browserInstance.close().catch(() => {});
    }
  }
};

async function fetchQwenAccountInfo(
  session: { cookies: string; userAgent?: string },
): Promise<ProviderAccountInfo> {
  void session;
  return { plan: "free" };
}
