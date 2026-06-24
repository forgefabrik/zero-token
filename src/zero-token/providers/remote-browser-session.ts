import { chromium, type Browser, type Page } from "playwright";
import { resolveCdpWebSocketUrl } from "./browser.js";

let browserPromise: Promise<Browser> | undefined;

async function connectRemoteBrowser(): Promise<Browser> {
  const cdpUrl = process.env.NOVA_CDP_URL?.trim();
  if (!cdpUrl) {
    throw new Error("NOVA_CDP_URL fehlt für browserbasierte Provider-Abfragen.");
  }

  if (!browserPromise) {
    browserPromise = resolveCdpWebSocketUrl(cdpUrl)
      .then((websocketUrl) => chromium.connectOverCDP(websocketUrl, { timeout: 10_000 }))
      .then((browser) => {
        browser.once("disconnected", () => {
          browserPromise = undefined;
        });
        return browser;
      })
      .catch((error) => {
        browserPromise = undefined;
        throw error;
      });
  }

  return browserPromise;
}

function belongsToOrigin(page: Page, origin: URL): boolean {
  try {
    const current = new URL(page.url());
    return current.hostname === origin.hostname || current.hostname.endsWith(`.${origin.hostname}`);
  } catch {
    return false;
  }
}

/**
 * Returns a page from the persistent remote-browser profile. The connection is
 * cached so model refreshes do not repeatedly open or close the shared browser.
 */
export async function getProviderBrowserPage(originValue: string): Promise<Page> {
  const origin = new URL(originValue);
  const browser = await connectRemoteBrowser();
  const context = browser.contexts()[0];
  if (!context) throw new Error("Remote-Chromium besitzt keinen Browser-Kontext.");

  const existing = context.pages().find((page) => belongsToOrigin(page, origin));
  if (existing) return existing;

  const page = await context.newPage();
  await page.goto(origin.toString(), {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });
  return page;
}
