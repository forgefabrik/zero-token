import type { ProviderAuthFunction, ProviderAccountInfo } from "./provider-types.js";
import {
  openProviderBrowser,
  waitForUrlLogin,
  extractCookies,
  extractLocalStorage,
} from "./browser.js";

const PERPLEXITY_URL = "https://www.perplexity.ai";
const AUTH_PATTERNS = ["/auth/", "/login", "/signin"];
const COOKIE_NAMES = ["__Secure-", "perplexity", "session", "token"];
const TOKEN_KEYS = ["accessToken", "perplexity-token", "sessionToken"];

/**
 * Perplexity-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Cookies und Session-Token extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: PERPLEXITY_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, PERPLEXITY_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const accessToken = await extractLocalStorage(page, TOKEN_KEYS);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    return {
      ok: true,
      session: { cookies, accessToken: accessToken ?? undefined, userAgent },
      info: await fetchPerplexityAccountInfo({ cookies, accessToken, userAgent }),
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

async function fetchPerplexityAccountInfo(
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
    const response = await fetch("https://www.perplexity.ai/api/auth/user", { headers });
    if (!response.ok) return { plan: "unknown" };
    const data = (await response.json()) as Record<string, unknown>;
    return {
      email: typeof data.email === "string" ? data.email : undefined,
      userId: typeof data.id === "string" ? data.id : typeof data.userId === "string" ? data.userId : undefined,
      plan: (data.subscription as string) === "pro" ? "pro" : "free",
    };
  } catch {
    return { plan: "unknown" };
  }
}
