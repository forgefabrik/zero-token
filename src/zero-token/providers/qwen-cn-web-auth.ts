import type { ProviderAuthFunction } from "./provider-types.js";
import {
  extractCookies,
  getCookieValue,
  openProviderBrowser,
} from "./browser.js";

const QWEN_CN_URL = "https://www.qianwen.com";
const SESSION_COOKIES = ["tongyi_sso_ticket", "login_aliyunid_ticket"];

/** Qwen China browser login for qianwen.com. */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: QWEN_CN_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    const timeout = config.loginTimeout ?? 300_000;
    const startedAt = Date.now();
    let loggedIn = false;

    while (Date.now() - startedAt < timeout) {
      const cookies = await page.context().cookies();
      loggedIn = cookies.some((cookie) => SESSION_COOKIES.includes(cookie.name));
      if (loggedIn) break;
      await page.waitForTimeout(1000);
    }

    if (!loggedIn) {
      return { ok: false, reason: "login-timeout" };
    }

    const cookies = await extractCookies(page);
    const xsrfToken = await getCookieValue(page, "XSRF-TOKEN");
    const userId = await getCookieValue(page, "b-user-id");
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: {
        cookies,
        userAgent,
        extra: {
          ...(xsrfToken ? { xsrfToken } : {}),
          ...(userId ? { userId } : {}),
        },
      },
      info: { userId, plan: "free" },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Browser konnte nicht geöffnet")) {
      return { ok: false, reason: "browser-launch-failed" };
    }
    return { ok: false, reason: "unknown-error" };
  } finally {
    if (browserInstance) await browserInstance.close().catch(() => {});
  }
};
