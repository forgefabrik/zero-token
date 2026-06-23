import type { SessionValidationResult } from "../session/session-types.js";

const DEEPSEEK_API = "https://chat.deepseek.com/api/v1/user/info";

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
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  try {
    const response = await fetch(DEEPSEEK_API, { headers });
    if (response.status === 401 || response.status === 403) {
      return { accountId: "", provider: "deepseek", valid: false, status: "expired", error: "Session abgelaufen" };
    }
    if (!response.ok) {
      return { accountId: "", provider: "deepseek", valid: false, status: "error", error: `HTTP ${response.status}` };
    }
    return { accountId: "", provider: "deepseek", valid: true, status: "valid", plan: "free" };
  } catch (err) {
    return { accountId: "", provider: "deepseek", valid: false, status: "error", error: `Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}` };
  }
}
