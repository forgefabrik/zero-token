import type { ModelInfo } from "../models/model-types.js";

const MODELS_API = "https://chatgpt.com/backend-api/models";

/**
 * Ruft die verfügbaren ChatGPT-Modelle ab.
 */
export async function discoverModels(
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
): Promise<ModelInfo[]> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent ?? "zero-token/0.1.0",
    Cookie: cookies,
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(MODELS_API, { headers });

  if (!response.ok) {
    throw new Error(`ChatGPT-Modell-API antwortete mit HTTP ${response.status}`);
  }

  const body = (await response.json()) as Record<string, unknown>;
  const models = body.models ?? body;

  if (!Array.isArray(models)) {
    throw new Error("Unerwartetes Antwortformat der Modell-API");
  }

  return models.map((m: Record<string, unknown>) => {
    const caps = (m.capabilities ?? m.capabilities ?? {}) as Record<string, unknown>;

    return {
      id: String(m.id ?? m.slug ?? ""),
      name: String(m.name ?? m.id ?? ""),
      slug: String(m.slug ?? m.id ?? ""),
      provider: "chatgpt" as const,
      capabilities: {
        text: caps.text !== false,
        vision: caps.vision === true || caps.vision === "true",
        voice: caps.voice === true || caps.voice === "true",
        plugins: caps.plugins === true || caps.plugins === "true",
      },
      maxTokens: typeof m.max_tokens === "number" ? m.max_tokens : undefined,
      enabled: m.enabled !== false,
    };
  });
}
