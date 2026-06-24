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
const PLAN_FIELD_PATTERN = /(plan|tier|subscription|account.?type|workspace.?type|product)/i;

type ChatGptPlan = ProviderAccountInfo["plan"];

/**
 * ChatGPT-Web-Auth: Browser öffnen, auf manuellen Login warten,
 * Session-Cookies und AccessToken extrahieren.
 */
export const auth: ProviderAuthFunction = async (config) => {
  let browserInstance: { close: () => Promise<void> } | null = null;

  try {
    const { browser, page } = await openProviderBrowser({
      targetUrl: CHATGPT_URL,
      cdpUrl: config.cdpUrl,
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

    const info = await fetchChatGPTAccountInfo({ cookies, accessToken, userAgent });

    // ChatGPT exposes the paid-plan label inconsistently. Reject only an
    // explicitly detected free account; an authenticated session whose plan is
    // not present in /api/auth/session is kept and validated by real requests.
    if (info.plan === "free") {
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

function normalizePlanValue(value: string): ChatGptPlan | undefined {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (
    normalized === "plus" ||
    normalized.includes("chatgpt_plus") ||
    normalized.includes("plus_plan")
  ) {
    return "plus";
  }

  if (
    normalized === "pro" ||
    normalized.includes("chatgpt_pro") ||
    normalized.includes("team") ||
    normalized.includes("business") ||
    normalized.includes("enterprise")
  ) {
    return "pro";
  }

  if (
    normalized === "free" ||
    normalized.includes("free_plan") ||
    normalized.includes("free_tier")
  ) {
    return "free";
  }

  return undefined;
}

export function detectChatGptPlan(
  value: unknown,
  depth = 0,
  visited = new Set<object>(),
): ChatGptPlan {
  if (depth > 5 || value === null || value === undefined) return "unknown";

  if (typeof value === "string") {
    return normalizePlanValue(value) ?? "unknown";
  }

  if (typeof value !== "object" || visited.has(value)) return "unknown";
  visited.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      const detected = detectChatGptPlan(item, depth + 1, visited);
      if (detected !== "unknown") return detected;
    }
    return "unknown";
  }

  const record = value as Record<string, unknown>;

  // Prefer values stored under plan-related keys to avoid matching unrelated
  // text elsewhere in the session payload.
  for (const [key, item] of Object.entries(record)) {
    if (!PLAN_FIELD_PATTERN.test(key)) continue;
    if (typeof item === "string") {
      const detected = normalizePlanValue(item);
      if (detected) return detected;
    }
    const nested = detectChatGptPlan(item, depth + 1, visited);
    if (nested !== "unknown") return nested;
  }

  for (const item of Object.values(record)) {
    if (typeof item !== "object" || item === null) continue;
    const nested = detectChatGptPlan(item, depth + 1, visited);
    if (nested !== "unknown") return nested;
  }

  return "unknown";
}

async function fetchChatGPTAccountInfo(
  session: ProviderSessionData,
): Promise<ProviderAccountInfo> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": session.userAgent ?? "nova/0.3.0",
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

  return {
    email: typeof user?.email === "string" ? user.email : undefined,
    userId: typeof user?.id === "string" ? user.id : undefined,
    name: typeof user?.name === "string" ? user.name : undefined,
    plan: detectChatGptPlan(data),
  };
}
