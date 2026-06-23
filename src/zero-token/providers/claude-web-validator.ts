import type { SessionValidationResult } from "../session/session-types.js";

const CLAUDE_API = "https://claude.ai/api/auth/session";

export async function validateSession(
  cookies: string,
  _accessToken: string | undefined,
  userAgent: string | undefined,
): Promise<SessionValidationResult> {
  try {
    const response = await fetch(CLAUDE_API, {
      headers: {
        Accept: "application/json",
        "User-Agent": userAgent ?? "zero-token/0.1.0",
        Cookie: cookies,
      },
    });

    if (response.status === 401 || response.status === 403) {
      return { accountId: "", provider: "claude", valid: false, status: "expired", error: "Session abgelaufen" };
    }
    if (!response.ok) {
      return { accountId: "", provider: "claude", valid: false, status: "error", error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as Record<string, unknown>;
    return {
      accountId: "",
      provider: "claude",
      valid: true,
      status: "valid",
      userId: typeof data.id === "string" ? data.id : undefined,
      email: typeof data.email === "string" ? data.email : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      plan: (data.plan as string) === "pro" ? "pro" : (data.plan as string) === "plus" ? "plus" : "unknown",
    };
  } catch (err) {
    return { accountId: "", provider: "claude", valid: false, status: "error", error: `Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}` };
  }
}
