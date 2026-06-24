import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  getCookieValue,
} from "./browser.js";

const CLAUDE_URL = "https://claude.ai";
const AUTH_PATTERNS = ["/auth/", "/login", "/signup"];
const COOKIE_NAMES = ["sessionKey", "__Host-session", "anthropic-device-id"];

export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: CLAUDE_URL,
      cdpUrl: config.cdpUrl,
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
    const info = await fetchClaudeAccountInfo(page);

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
    // Bei einer CDP-Verbindung gehört Chromium dem Remote-Browser-Container.
    // Nova darf diesen gemeinsam genutzten, persistenten Browser nicht schließen.
    if (browserInstance && !config.cdpUrl) {
      await browserInstance.close().catch(() => {});
    }
  }
};

async function fetchClaudeAccountInfo(page: {
  evaluate: <T>(callback: () => Promise<T>) => Promise<T>;
}): Promise<ProviderAccountInfo> {
  try {
    const data = await page.evaluate(async () => {
      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      const session = sessionResponse.ok ? await sessionResponse.json() : null;

      const organizationsResponse = await fetch("/api/organizations", {
        credentials: "include",
        cache: "no-store",
      });
      const organizations = organizationsResponse.ok
        ? await organizationsResponse.json()
        : [];

      return { session, organizations };
    });

    const session = (data.session ?? {}) as Record<string, unknown>;
    const organizations = Array.isArray(data.organizations)
      ? (data.organizations as Record<string, unknown>[])
      : [];
    const primaryOrganization = organizations[0] ?? {};
    const searchable = JSON.stringify({ session, organizations }).toLowerCase();

    let plan: ProviderAccountInfo["plan"] = "free";
    if (/enterprise/.test(searchable)) plan = "pro";
    else if (/team|business/.test(searchable)) plan = "pro";
    else if (/max/.test(searchable)) plan = "pro";
    else if (/pro|paid|premium/.test(searchable)) plan = "pro";
    else if (/plus/.test(searchable)) plan = "plus";

    const user = (session.user ?? session.account ?? session) as Record<string, unknown>;
    return {
      email:
        typeof user.email === "string"
          ? user.email
          : typeof primaryOrganization.email === "string"
            ? primaryOrganization.email
            : undefined,
      userId:
        typeof user.id === "string"
          ? user.id
          : typeof user.uuid === "string"
            ? user.uuid
            : undefined,
      name:
        typeof user.name === "string"
          ? user.name
          : typeof user.full_name === "string"
            ? user.full_name
            : undefined,
      plan,
    };
  } catch {
    // Ein erfolgreicher Browser-Login ohne explizites Tarifmerkmal entspricht
    // bei Claude einem nutzbaren Free-Account und nicht "unknown".
    return { plan: "free" };
  }
}
