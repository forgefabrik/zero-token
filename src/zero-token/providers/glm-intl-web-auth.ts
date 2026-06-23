import type { ProviderAuthFunction } from "./provider-types.js";
import {
  extractCookies,
  extractLocalStorage,
  openProviderBrowser,
} from "./browser.js";

const GLM_INTL_URL = "https://chat.z.ai";
const TOKEN_KEYS = ["accessToken", "access_token", "auth_token", "token"];

/** GLM International browser login for chat.z.ai. */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: GLM_INTL_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await page.waitForFunction(
      () => {
        const cookie = document.cookie;
        const hasAuthCookie = [
          "chatglm_refresh_token",
          "refresh_token",
          "auth_token",
          "access_token",
          "session",
        ].some((name) => cookie.includes(name));
        const hasChatInput = Boolean(
          document.querySelector(
            'textarea, [contenteditable="true"], .chat-input, .message-input',
          ),
        );
        const onAuthPage = /login|signin|auth/i.test(window.location.pathname);
        return hasAuthCookie || (hasChatInput && !onAuthPage);
      },
      undefined,
      { timeout: config.loginTimeout ?? 300_000, polling: 1000 },
    );

    const cookies = await extractCookies(page);
    const accessToken = await extractLocalStorage(page, TOKEN_KEYS);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: { cookies, accessToken: accessToken ?? undefined, userAgent },
      info: { plan: "free" },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Timeout") || message.includes("Login nicht innerhalb")) {
      return { ok: false, reason: "login-timeout" };
    }
    if (message.includes("Browser konnte nicht geöffnet")) {
      return { ok: false, reason: "browser-launch-failed" };
    }
    return { ok: false, reason: "unknown-error" };
  } finally {
    if (browserInstance) await browserInstance.close().catch(() => {});
  }
};
