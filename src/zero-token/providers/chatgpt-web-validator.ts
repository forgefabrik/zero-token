import type { SessionValidationResult } from "../session/session-types.js";

const ACCOUNT_API = "https://chatgpt.com/api/auth/session";

/**
 * ChatGPT-Session-Validierung.
 * Ruft /api/auth/session auf und prüft ob der User eingeloggt ist.
 */
export async function validateSession(
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
): Promise<SessionValidationResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent ?? "zero-token/0.1.0",
    Cookie: cookies,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  try {
    const response = await fetch(ACCOUNT_API, { headers, redirect: "follow" });

    if (response.status === 401 || response.status === 403) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "expired",
        error: `HTTP ${response.status} – Session abgelaufen`,
      };
    }

    if (!response.ok) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "error",
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const user = data.user as Record<string, unknown> | undefined;

    if (!user || !user.email) {
      return {
        accountId: "",
        provider: "chatgpt",
        valid: false,
        status: "expired",
        error: "Kein User-Objekt in der API-Antwort",
      };
    }

    const plan =
      data.plan === "plus" || (user?.plan as string) === "plus" ? "plus" : "unknown";

    return {
      accountId: "",
      provider: "chatgpt",
      valid: true,
      status: "valid",
      userId: typeof user.id === "string" ? user.id : undefined,
      email: typeof user.email === "string" ? user.email : undefined,
      name: typeof user.name === "string" ? user.name : undefined,
      plan,
      expiresAt: typeof data.expires === "string" ? data.expires : undefined,
    };
  } catch (err) {
    return {
      accountId: "",
      provider: "chatgpt",
      valid: false,
      status: "error",
      error: `Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
