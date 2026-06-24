import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import logger from "../logger.js";

export interface OpenBrowserResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class ProviderBrowserError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = "ProviderBrowserError";
  }
}

export interface BrowserLaunchConfig {
  cdpUrl?: string;
  cdpPort?: number;
  headless?: boolean;
  proxy?: string;
  /** URL to navigate to after opening */
  targetUrl: string;
  loginTimeout?: number;
}

interface CdpVersionResponse {
  webSocketDebuggerUrl?: string;
}

const CDP_DISCOVERY_TIMEOUT_MS = 5_000;
const CDP_CONNECT_TIMEOUT_MS = 10_000;

async function resolveCdpNetworkUrl(remoteUrl: string): Promise<URL> {
  const resolved = new URL(remoteUrl);
  const hostname = resolved.hostname;

  if (hostname === "localhost" || isIP(hostname)) {
    return resolved;
  }

  try {
    const result = await lookup(hostname, { family: 4 });
    resolved.hostname = result.address;
    logger.debug(
      { cdpService: hostname, cdpAddress: result.address },
      "CDP-Dienstname über Docker-DNS aufgelöst",
    );
    return resolved;
  } catch (error) {
    throw new ProviderBrowserError(
      `CDP-Host ${hostname} konnte nicht aufgelöst werden.`,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Chromium may advertise a loopback websocket URL from inside its own
 * container. Resolve Docker service names to an IP accepted by Chromium's
 * DevTools host-header validation and rewrite the advertised websocket URL.
 */
export async function resolveCdpWebSocketUrl(remoteUrl: string): Promise<string> {
  const configured = await resolveCdpNetworkUrl(remoteUrl);
  if (configured.protocol === "ws:" || configured.protocol === "wss:") {
    return configured.toString();
  }
  if (configured.protocol !== "http:" && configured.protocol !== "https:") {
    throw new ProviderBrowserError(`Ungültiges CDP-Protokoll: ${configured.protocol}`);
  }

  const versionUrl = new URL("/json/version", configured);
  const response = await fetch(versionUrl, {
    signal: AbortSignal.timeout(CDP_DISCOVERY_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new ProviderBrowserError(
      `CDP-Status unter ${versionUrl.toString()} antwortet mit HTTP ${response.status}.`,
    );
  }

  const payload = (await response.json()) as CdpVersionResponse;
  if (!payload.webSocketDebuggerUrl) {
    throw new ProviderBrowserError("Chromium liefert keine webSocketDebuggerUrl.");
  }

  const advertised = new URL(payload.webSocketDebuggerUrl);
  advertised.protocol = configured.protocol === "https:" ? "wss:" : "ws:";
  advertised.hostname = configured.hostname;
  advertised.port = configured.port;
  return advertised.toString();
}

/**
 * Opens Chromium either by connecting to a remote CDP endpoint or by launching
 * a local process. Server deployments should configure NOVA_CDP_URL.
 */
export async function openProviderBrowser(
  config: BrowserLaunchConfig,
): Promise<OpenBrowserResult> {
  try {
    const browser = await launchBrowser(config);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    logger.info({ url: config.targetUrl }, "Navigiere zur Login-Seite …");
    await page.goto(config.targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    return { browser, context, page };
  } catch (err) {
    throw new ProviderBrowserError(
      "Browser konnte nicht geöffnet werden.",
      err instanceof Error ? err : undefined,
    );
  }
}

async function launchBrowser(config: BrowserLaunchConfig): Promise<Browser> {
  const remoteUrl = config.cdpUrl?.trim() || process.env.NOVA_CDP_URL?.trim();
  if (remoteUrl) {
    logger.info({ cdpUrl: remoteUrl }, "Verbinde zu Remote-Chromium über CDP …");
    try {
      const websocketUrl = await resolveCdpWebSocketUrl(remoteUrl);
      logger.info(
        { cdpHost: new URL(websocketUrl).host },
        "CDP-WebSocket aufgelöst; Verbindung wird hergestellt …",
      );
      return await chromium.connectOverCDP(websocketUrl, {
        timeout: CDP_CONNECT_TIMEOUT_MS,
      });
    } catch (err) {
      throw new ProviderBrowserError(
        `Keine Verbindung zum Remote-Chromium unter ${remoteUrl} möglich.`,
        err instanceof Error ? err : undefined,
      );
    }
  }

  if (config.cdpPort) {
    logger.info({ cdpPort: config.cdpPort }, "Verbinde zu bestehendem Chrome über CDP …");
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`, {
        timeout: CDP_CONNECT_TIMEOUT_MS,
      });
    } catch (err) {
      throw new ProviderBrowserError(
        `Keine Verbindung zu Chrome auf Port ${config.cdpPort} möglich. ` +
          "Stelle sicher, dass Chrome mit --remote-debugging-port=<port> läuft.",
        err instanceof Error ? err : undefined,
      );
    }
  }

  logger.info("Starte Chromium (nicht-headless) …");
  return await chromium.launch({
    headless: config.headless ?? false,
    ...(config.proxy && { proxy: { server: config.proxy } }),
  });
}

/**
 * Generic URL-based login waiter.
 * Polls the page URL until it no longer matches any of the auth-path patterns.
 */
export async function waitForUrlLogin(
  page: Page,
  baseUrl: string,
  authPathPatterns: string[],
  timeout: number = 300_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const url = page.url();

    const onAuthPage = authPathPatterns.some((p) => url.includes(p));
    if (url.startsWith(baseUrl) && !onAuthPage) {
      await page.waitForTimeout(1500);
      logger.info("Login erkannt (URL-Wechsel).");
      return;
    }

    if (url.includes("error") || url.includes("not-found")) {
      await page.waitForTimeout(500);
    }

    await page.waitForTimeout(500);
  }

  throw new ProviderBrowserError(
    `Login nicht innerhalb von ${timeout / 1000}s abgeschlossen.`,
  );
}

/**
 * Generic request-response-based login waiter.
 * Listens for a specific API response that indicates login success.
 */
export async function waitForApiLogin(
  page: Page,
  baseUrl: string,
  successApiPath: string,
  timeout: number = 300_000,
): Promise<void> {
  const start = Date.now();
  let resolved = false;

  page.on("response", (response) => {
    if (response.url().includes(successApiPath) && response.status() === 200) {
      resolved = true;
    }
  });

  while (Date.now() - start < timeout) {
    if (resolved) {
      await page.waitForTimeout(1000);
      logger.info({ apiPath: successApiPath }, "Login erkannt (API-Antwort).");
      return;
    }

    const url = page.url();
    if (url.startsWith(baseUrl) && !url.includes("/auth/") && !url.includes("/login")) {
      await page.waitForTimeout(1500);
      logger.info("Login erkannt (URL-Wechsel).");
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new ProviderBrowserError(
    `Login nicht innerhalb von ${timeout / 1000}s abgeschlossen.`,
  );
}

/** Extracts cookies as a semicolon-separated header string. */
export async function extractCookies(
  page: Page,
  relevantCookieNames: string[] = [],
): Promise<string> {
  const browserCookies = await page.context().cookies();

  const relevant = relevantCookieNames.length
    ? browserCookies.filter((c) =>
        relevantCookieNames.some((name) => c.name.includes(name)),
      )
    : browserCookies;

  if (relevant.length === 0) {
    logger.warn("Keine der bekannten Session-Cookies gefunden, nehme alle Cookies.");
  }

  const cookieMap = new Map<string, string>();
  for (const c of relevant.length ? relevant : browserCookies) {
    cookieMap.set(c.name, c.value);
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** Extracts a value from localStorage by trying multiple possible keys. */
export async function extractLocalStorage(
  page: Page,
  possibleKeys: string[],
): Promise<string | null> {
  for (const key of possibleKeys) {
    try {
      const value = await page.evaluate((k: string) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      }, key);
      if (value) return value;
    } catch {
      continue;
    }
  }
  return null;
}

/** Reads cookie value by name from the browser context. */
export async function getCookieValue(
  page: Page,
  cookieName: string,
): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((c) => c.name === cookieName)?.value;
}
