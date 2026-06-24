import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { chromium } from "playwright";
import type { Browser, BrowserContext, Page, Request } from "playwright";
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

interface ObservedSessionHeaders {
  authorization?: string;
  cookie?: string;
}

const CDP_DISCOVERY_TIMEOUT_MS = 5_000;
const CDP_CONNECT_TIMEOUT_MS = 10_000;
const SESSION_COOKIE_PATTERN = /(session|token|auth|jwt|sid|login|account)/i;
const observedSessionByPage = new WeakMap<Page, ObservedSessionHeaders>();

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

function requestBelongsToProvider(requestUrl: string, baseUrl: string): boolean {
  try {
    const requestHost = new URL(requestUrl).hostname.toLowerCase();
    const baseHost = new URL(baseUrl).hostname.toLowerCase();
    return requestHost === baseHost || requestHost.endsWith(`.${baseHost}`);
  } catch {
    return false;
  }
}

function observeProviderSession(page: Page, baseUrl: string): () => void {
  const listener = (request: Request) => {
    if (!requestBelongsToProvider(request.url(), baseUrl)) return;

    const headers = request.headers();
    const authorization = headers.authorization?.trim();
    const cookie = headers.cookie?.trim();
    if (!authorization && !cookie) return;

    const current = observedSessionByPage.get(page) ?? {};
    observedSessionByPage.set(page, {
      authorization: authorization || current.authorization,
      cookie: cookie || current.cookie,
    });
  };

  page.on("request", listener);
  return () => page.off("request", listener);
}

function normalizeAuthorization(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^Bearer\s+/i, "").trim();
  return normalized || undefined;
}

async function readGenericStorageToken(page: Page): Promise<string | undefined> {
  try {
    return await page.evaluate(() => {
      const keyPattern = /(token|auth|session|jwt)/i;
      const stores: Storage[] = [];
      try {
        stores.push(localStorage);
      } catch {
        // The current origin can temporarily block storage access.
      }
      try {
        stores.push(sessionStorage);
      } catch {
        // The current origin can temporarily block storage access.
      }

      for (const store of stores) {
        for (let index = 0; index < store.length; index += 1) {
          const key = store.key(index);
          if (!key || !keyPattern.test(key)) continue;
          const value = store.getItem(key)?.trim();
          if (value) return value;
        }
      }
      return undefined;
    });
  } catch {
    return undefined;
  }
}

async function hasProviderSession(page: Page, baseUrl: string): Promise<boolean> {
  const observed = observedSessionByPage.get(page);
  if (normalizeAuthorization(observed?.authorization)) return true;
  if (observed?.cookie && SESSION_COOKIE_PATTERN.test(observed.cookie)) return true;

  try {
    const cookies = await page.context().cookies([baseUrl]);
    if (
      cookies.some(
        (cookie) => cookie.value.trim().length > 0 && SESSION_COOKIE_PATTERN.test(cookie.name),
      )
    ) {
      return true;
    }
    if (cookies.filter((cookie) => cookie.value.trim().length > 0).length >= 2) {
      return true;
    }
  } catch {
    // Keep waiting while the page changes origin during authentication.
  }

  return Boolean(await readGenericStorageToken(page));
}

/**
 * Waits until the page has left the auth route and real provider credentials
 * are present. A URL change alone is not considered a successful login.
 */
export async function waitForUrlLogin(
  page: Page,
  baseUrl: string,
  authPathPatterns: string[],
  timeout: number = 300_000,
): Promise<void> {
  const start = Date.now();
  const stopObserving = observeProviderSession(page, baseUrl);

  try {
    while (Date.now() - start < timeout) {
      const url = page.url();
      const onAuthPage = authPathPatterns.some((pattern) => url.includes(pattern));
      const onProviderPage = requestBelongsToProvider(url, baseUrl);

      if (onProviderPage && !onAuthPage && (await hasProviderSession(page, baseUrl))) {
        await page.waitForTimeout(750);
        logger.info("Login erkannt (Sessiondaten vorhanden).");
        return;
      }

      if (url.includes("error") || url.includes("not-found")) {
        await page.waitForTimeout(500);
      }

      await page.waitForTimeout(500);
    }
  } finally {
    stopObserving();
  }

  throw new ProviderBrowserError(
    `Login nicht innerhalb von ${timeout / 1000}s abgeschlossen.`,
  );
}

/**
 * Generic request-response-based login waiter.
 * A successful API response is only accepted when credentials are present.
 */
export async function waitForApiLogin(
  page: Page,
  baseUrl: string,
  successApiPath: string,
  timeout: number = 300_000,
): Promise<void> {
  const start = Date.now();
  let resolved = false;
  const stopObserving = observeProviderSession(page, baseUrl);

  const responseListener = (response: { url(): string; status(): number }) => {
    if (response.url().includes(successApiPath) && response.status() === 200) {
      resolved = true;
    }
  };
  page.on("response", responseListener);

  try {
    while (Date.now() - start < timeout) {
      if (resolved && (await hasProviderSession(page, baseUrl))) {
        await page.waitForTimeout(750);
        logger.info({ apiPath: successApiPath }, "Login erkannt (API und Sessiondaten).");
        return;
      }

      const url = page.url();
      const offAuthPage =
        requestBelongsToProvider(url, baseUrl) &&
        !url.includes("/auth/") &&
        !url.includes("/login");
      if (offAuthPage && (await hasProviderSession(page, baseUrl))) {
        await page.waitForTimeout(750);
        logger.info("Login erkannt (Sessiondaten vorhanden).");
        return;
      }

      await page.waitForTimeout(500);
    }
  } finally {
    page.off("response", responseListener);
    stopObserving();
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
    ? browserCookies.filter((cookie) =>
        relevantCookieNames.some((name) =>
          cookie.name.toLowerCase().includes(name.toLowerCase()),
        ),
      )
    : browserCookies;

  const selected = relevant.length ? relevant : browserCookies;
  if (selected.length > 0) {
    const cookieMap = new Map<string, string>();
    for (const cookie of selected) {
      cookieMap.set(cookie.name, cookie.value);
    }
    return Array.from(cookieMap.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  const observedCookie = observedSessionByPage.get(page)?.cookie?.trim();
  if (observedCookie) return observedCookie;

  logger.warn("Keine Session-Cookies im Browserkontext gefunden.");
  return "";
}

/** Extracts a value from localStorage/sessionStorage or an observed auth header. */
export async function extractLocalStorage(
  page: Page,
  possibleKeys: string[],
): Promise<string | null> {
  for (const key of possibleKeys) {
    try {
      const value = await page.evaluate((candidate: string) => {
        try {
          const localValue = localStorage.getItem(candidate);
          if (localValue) return localValue;
        } catch {
          // Ignore inaccessible local storage.
        }
        try {
          return sessionStorage.getItem(candidate);
        } catch {
          return null;
        }
      }, key);
      if (value) return value;
    } catch {
      continue;
    }
  }

  const genericToken = await readGenericStorageToken(page);
  if (genericToken) return genericToken;

  return normalizeAuthorization(observedSessionByPage.get(page)?.authorization) ?? null;
}

/** Reads cookie value by name from the browser context. */
export async function getCookieValue(
  page: Page,
  cookieName: string,
): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === cookieName)?.value;
}
