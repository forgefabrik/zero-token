import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import logger from "../logger.js";
import { resolveCdpWebSocketUrl } from "./browser.js";
import { ensureProviderBrowserProfile } from "./provider-browser-profiles.js";

const browserPromises = new Map<string, Promise<Browser>>();
const configuredClaudeContexts = new WeakSet<BrowserContext>();

async function connectRemoteBrowser(cdpUrl: string): Promise<Browser> {
  const cached = browserPromises.get(cdpUrl);
  if (cached) return cached;

  const promise = resolveCdpWebSocketUrl(cdpUrl)
    .then((websocketUrl) =>
      chromium.connectOverCDP(websocketUrl, { timeout: 10_000 }),
    )
    .then((browser) => {
      browser.once("disconnected", () => {
        browserPromises.delete(cdpUrl);
      });
      return browser;
    })
    .catch((error) => {
      browserPromises.delete(cdpUrl);
      throw error;
    });

  browserPromises.set(cdpUrl, promise);
  return promise;
}

function belongsToOrigin(page: Page, origin: URL): boolean {
  try {
    const current = new URL(page.url());
    return (
      current.hostname === origin.hostname ||
      current.hostname.endsWith(`.${origin.hostname}`)
    );
  } catch {
    return false;
  }
}

async function configureClaudeRequestIdentity(
  context: BrowserContext,
): Promise<void> {
  if (configuredClaudeContexts.has(context)) return;

  const cookies = await context.cookies("https://claude.ai");
  const deviceId = cookies.find(
    (cookie) => cookie.name === "anthropic-device-id",
  )?.value;
  if (!deviceId) {
    logger.warn(
      { provider: "claude" },
      "Claude-Profil enthält noch keine anthropic-device-id",
    );
    return;
  }

  await context.route("https://claude.ai/api/**", async (route) => {
    const request = route.request();
    await route.continue({
      headers: {
        ...request.headers(),
        "anthropic-device-id": deviceId,
      },
    });
  });
  configuredClaudeContexts.add(context);
  logger.info(
    { provider: "claude", deviceIdSource: "browser-cookie" },
    "Claude-API-Requests an persistente Geräte-ID gebunden",
  );
}

/**
 * Returns a page from the isolated persistent profile for this provider.
 * Each provider uses its own Chromium process, user-data directory and CDP port.
 */
export async function getProviderBrowserPage(originValue: string): Promise<Page> {
  const origin = new URL(originValue);
  const profile = await ensureProviderBrowserProfile(origin.toString(), {
    reset: false,
    fallbackCdpUrl: process.env.NOVA_CDP_URL,
  });
  const browser = await connectRemoteBrowser(profile.cdpUrl);
  const context = browser.contexts()[0];
  if (!context) {
    throw new Error(
      `Providerprofil ${profile.profile} besitzt keinen Browser-Kontext.`,
    );
  }

  if (profile.profile === "claude") {
    await configureClaudeRequestIdentity(context);
  }

  const existing = context.pages().find((page) => belongsToOrigin(page, origin));
  if (existing) return existing;

  const page = await context.newPage();
  await page.goto(origin.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  return page;
}
