import type { ChatGPTSessionData, ChatGPTAccountInfo } from "./chatgpt-types.js";
import { ChatGPTNotPlusError, ChatGPTNetworkError } from "./chatgpt-errors.js";
import logger from "../../logger.js";

const ACCOUNT_API = "https://chatgpt.com/api/auth/session";

/**
 * Ruft die Account-Informationen von ChatGPT ab und prüft den Plus-Status.
 *
 * Verwendet die extrahierte Session (Cookies + AccessToken) für die Anfrage.
 */
export async function fetchAccountInfo(
  session: ChatGPTSessionData,
): Promise<ChatGPTAccountInfo> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": session.userAgent ?? "zero-token/0.1.0",
    Cookie: session.cookies,
  };

  if (session.accessToken) {
    headers["Authorization"] = `Bearer ${session.accessToken}`;
  }

  logger.info("Prüfe Account-Status bei ChatGPT …");

  let response: Response;
  try {
    response = await fetch(ACCOUNT_API, { headers, redirect: "follow" });
  } catch (err) {
    throw new ChatGPTNetworkError(
      `Netzwerkfehler beim Abruf der Account-Informationen: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!response.ok) {
    throw new ChatGPTNetworkError(
      `ChatGPT API antwortete mit Status ${response.status}.`,
      response.status,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ChatGPTNetworkError("Ungültige JSON-Antwort von ChatGPT API.");
  }

  if (!body || typeof body !== "object") {
    throw new ChatGPTNetworkError("Unerwartetes Antwortformat von ChatGPT API.");
  }

  const data = body as Record<string, unknown>;
  const user = data.user as Record<string, unknown> | undefined;

  const accountInfo: ChatGPTAccountInfo = {
    email: typeof user?.email === "string" ? user.email : undefined,
    userId: typeof user?.id === "string" ? user.id : undefined,
    name: typeof user?.name === "string" ? user.name : undefined,
    plan: "unknown",
    workspaceId: typeof data.workspaceId === "string" ? data.workspaceId : undefined,
  };

  // Prüfe Plus-Status
  const plan = typeof data.plan === "string" ? data.plan : user?.plan;
  const isPlus =
    plan === "plus" ||
    (typeof user?.plan === "string" && user.plan === "plus");

  if (isPlus) {
    accountInfo.plan = "plus";
  }

  logger.info({ plan: accountInfo.plan }, "Account-Status ermittelt.");
  return accountInfo;
}

/**
 * Prüft, ob der Account Plus-Zugriff hat. Wirft ChatGPTNotPlusError, falls nicht.
 */
export function requirePlusPlan(info: ChatGPTAccountInfo): void {
  if (info.plan !== "plus") {
    throw new ChatGPTNotPlusError();
  }
}
