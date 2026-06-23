import type {
  ProviderAuthFunction,
  ProviderSessionData,
  ProviderAccountInfo,
} from "./provider-types.js";
import { openProviderBrowser, waitForUrlLogin, extractCookies, extractLocalStorage } from "./browser.js";

const CHATGPT_URL = "https://chatgpt.com";
const AUTH_PATTERNS = ["/auth/"];
const COOKIE_NAMES = ["__Secure-next-auth", "__cf_bm", "cf_clearance", "session_id", "__Host-authjs.csrf-token"];
const TOKEN_KEYS = ["accessToken", "oidc.accessToken", "next-auth.accessToken", "__session"];

/**
 * ChatGPT-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Session-Cookies und AccessToken extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: CHATGPT_URL,
      cdpPort: config.cdpPort,
      headless: config.headless,
      proxy: config.proxy,
      loginTimeout: config.loginTimeout,
    });
    browserInstance = browser;

    await waitForUrlLogin(page, CHATGPT_URL, AUTH_PATTERNS, config.loginTimeout ?? 300_000);

    const cookies = await extractCookies(page, COOKIE_NAMES);
    const accessToken = (await extractLocalStorage(page, TOKEN_KEYS)) ?? undefined;
    const userAgent = await page.evaluate(() => navigator.userAgent);

    // Fetch account info for plan check
    const info = await fetchChatGPTAccountInfo({ cookies, accessToken, userAgent });

    if (info.plan !== "plus") {
      return { ok: false, reason: "plan-not-supported" };
    }

    return {
      ok: true,
      session: { cookies, accessToken: accessToken ?? undefined, userAgent },
      info,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Login nicht innerhalb")) {
      return { ok: false, reason: "login-timeout" };
    }
    if (msg.includes("Browser konnte nicht geöffnet")) {
      return { ok: false, reason: "browser-launch-failed" };
    }
    return { ok: false, reason: "unknown-error" };
  } finally {
    if (browserInstance) {
      await browserInstance.close().catch(() => {});
    }
  }
};

async function fetchChatGPTAccountInfo(
  session: ProviderSessionData,
): Promise<ProviderAccountInfo> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": session.userAgent ?? "zero-token/0.1.0",
    Cookie: session.cookies,
  };
  if (session.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  const response = await fetch("https://chatgpt.com/api/auth/session", {
    headers,
    redirect: "follow",
  });

  if (!response.ok) {
    return { plan: "unknown" };
  }

  const data = (await response.json()) as Record<string, unknown>;
  const user = data.user as Record<string, unknown> | undefined;

  const plan =
    data.plan === "plus" || (user?.plan as string) === "plus" ? "plus" : "unknown";

  return {
    email: typeof user?.email === "string" ? user.email : undefined,
    userId: typeof user?.id === "string" ? user.id : undefined,
    name: typeof user?.name === "string" ? user.name : undefined,
    plan,
  };
}
