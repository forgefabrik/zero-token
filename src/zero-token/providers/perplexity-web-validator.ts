import type { SessionValidationResult } from "../session/session-types.js";

const PERPLEXITY_API = "https://www.perplexity.ai/api/auth/user";

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
    const response = await fetch(PERPLEXITY_API, { headers });
    if (response.status === 401 || response.status === 403) {
      return { accountId: "", provider: "perplexity", valid: false, status: "expired", error: "Session abgelaufen" };
    }
    if (!response.ok) {
      return { accountId: "", provider: "perplexity", valid: false, status: "error", error: `HTTP ${response.status}` };
    }
    const data = (await response.json()) as Record<string, unknown>;
    return {
      accountId: "",
      provider: "perplexity",
      valid: true,
      status: "valid",
      email: typeof data.email === "string" ? data.email : undefined,
      userId: typeof data.id === "string" ? data.id : undefined,
      plan: (data.subscription as string) === "pro" ? "pro" : "free",
    };
  } catch (err) {
    return { accountId: "", provider: "perplexity", valid: false, status: "error", error: `Netzwerkfehler: ${err instanceof Error ? err.message : String(err)}` };
  }
}
