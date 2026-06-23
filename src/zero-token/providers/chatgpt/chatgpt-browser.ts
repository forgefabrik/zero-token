import { chromium } from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";
import type { ChatGPTBrowserConfig } from "./chatgpt-types.js";
import { ChatGPTBrowserError } from "./chatgpt-errors.js";
import logger from "../../logger.js";

const CHATGPT_URL = "https://chatgpt.com";

export interface OpenBrowserResult {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/**
 * Öffnet einen Chromium-Browser (entweder via CDP an bestehendem Chrome
 * oder neu gestartet) und navigiert zu chatgpt.com.
 *
 * Der Benutzer muss sich manuell anmelden. Die Funktion wartet,
 * bis die Seite den Login-Zustand erkennt.
 */
export async function openChatGPTBrowser(
  config: ChatGPTBrowserConfig = {},
): Promise<OpenBrowserResult> {
  const timeout = config.loginTimeout ?? 300_000;

  try {
    const browser = await launchBrowser(config);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    logger.info("Öffne chatgpt.com …");
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });

    return { browser, context, page };
  } catch (err) {
    throw new ChatGPTBrowserError(
      "Browser konnte nicht geöffnet werden.",
      err instanceof Error ? err : undefined,
    );
  }
}

async function launchBrowser(config: ChatGPTBrowserConfig): Promise<Browser> {
  if (config.cdpPort) {
    logger.info({ cdpPort: config.cdpPort }, "Verbinde zu bestehendem Chrome über CDP …");
    try {
      return await chromium.connectOverCDP(`http://127.0.0.1:${config.cdpPort}`);
    } catch (err) {
      throw new ChatGPTBrowserError(
        `Keine Verbindung zu Chrome auf Port ${config.cdpPort} möglich. ` +
          "Stelle sicher, dass Chrome mit --remote-debugging-port=9222 läuft.",
        err instanceof Error ? err : undefined,
      );
    }
  }

  logger.info("Starte Chromium (nicht-headless) …");
  return await chromium.launch({
    headless: config.headless ?? false, // user needs to see the login page
    ...(config.proxy && {
      proxy: { server: config.proxy },
    }),
  });
}

/**
 * Wartet darauf, dass der Benutzer sich bei ChatGPT anmeldet.
 * Erkennt Login anhand der URL (Umschaltung von /auth/* → /).
 */
export async function waitForLogin(
  page: Page,
  timeout: number = 300_000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const url = page.url();

    // Successful login redirects away from auth pages
    if (url.startsWith(CHATGPT_URL) && !url.includes("/auth/")) {
      // Give the page a moment to fully hydrate
      await page.waitForTimeout(1500);
      logger.info("Login erkannt.");
      return;
    }

    await page.waitForTimeout(500);
  }

  throw new ChatGPTBrowserError(
    `Login nicht innerhalb von ${timeout / 1000}s abgeschlossen.`,
  );
}
