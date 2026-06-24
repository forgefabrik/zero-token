import { chromium, type Browser, type Page } from "playwright";
import { resolveCdpWebSocketUrl } from "./browser.js";
import { ensureProviderBrowserProfile } from "./provider-browser-profiles.js";

const browserPromises = new Map<string, Promise<Browser>>();

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

  const existing = context.pages().find((page) => belongsToOrigin(page, origin));
  if (existing) return existing;

  const page = await context.newPage();
  await page.goto(origin.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  return page;
}
