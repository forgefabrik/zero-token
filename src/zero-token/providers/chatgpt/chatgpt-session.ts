import type { Page } from "playwright";
import type { ChatGPTSessionData } from "./chatgpt-types.js";
import { ChatGPTSessionError } from "./chatgpt-errors.js";
import logger from "../../logger.js";

/**
 * Extrahiert Session-Daten aus der aktuellen ChatGPT-Seite:
 * - Cookies (als HTTP-Header-String)
 * - AccessToken (aus localStorage)
 * - User-Agent
 */
export async function extractSessionData(page: Page): Promise<ChatGPTSessionData> {
  try {
    const cookies = await extractCookies(page);
    const accessToken = await extractAccessToken(page);
    const userAgent = await page.evaluate(() => navigator.userAgent);

    logger.info("Session-Daten erfolgreich extrahiert.");

    return {
      cookies,
      accessToken: accessToken ?? undefined,
      userAgent,
    };
  } catch (err) {
    throw new ChatGPTSessionError(
      "Session-Daten konnten nicht extrahiert werden.",
    );
  }
}

async function extractCookies(page: Page): Promise<string> {
  const browserCookies = await page.context().cookies();

  const relevant = browserCookies.filter(
    (c) =>
      c.name.includes("__Secure-next-auth") ||
      c.name.includes("__cf_bm") ||
      c.name.includes("cf_clearance") ||
      c.name === "session_id" ||
      c.name === "__Host-authjs.csrf-token",
  );

  if (relevant.length === 0) {
    // Fallback: alle Cookies nehmen
    logger.warn("Keine bekannten Session-Cookies gefunden, nehme alle Cookies.");
  }

  const cookieMap = new Map<string, string>();
  for (const c of (relevant.length ? relevant : browserCookies)) {
    cookieMap.set(c.name, c.value);
  }

  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

async function extractAccessToken(page: Page): Promise<string | null> {
  try {
    // ChatGPT speichert den AccessToken in verschiedenen localStorage-Keys
    const possibleKeys = [
      "accessToken",
      "oidc.accessToken",
      "next-auth.accessToken",
      "__session",
    ];

    for (const key of possibleKeys) {
      const value = await page.evaluate((k: string) => {
        try {
          return localStorage.getItem(k);
        } catch {
          return null;
        }
      }, key);

      if (value) return value;
    }

    return null;
  } catch {
    return null;
  }
}
