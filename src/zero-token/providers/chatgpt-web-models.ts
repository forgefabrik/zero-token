import type { ModelInfo } from "../models/model-types.js";
import { getProviderBrowserPage } from "./remote-browser-session.js";

const CHATGPT_ORIGIN = "https://chatgpt.com/";

interface BrowserFetchResult {
  status: number;
  body: string;
}

function isUnavailable(model: Record<string, unknown>): boolean {
  const availability = String(model.availability ?? model.status ?? "").toLowerCase();
  return (
    model.enabled === false ||
    model.available === false ||
    model.disabled === true ||
    model.is_disabled === true ||
    model.hidden === true ||
    model.is_hidden === true ||
    model.internal === true ||
    model.is_internal === true ||
    ["disabled", "unavailable", "hidden", "internal"].includes(availability)
  );
}

function capability(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * Reads the model catalog inside the authenticated ChatGPT browser context.
 * Direct Node fetches are intentionally avoided because ChatGPT binds its web
 * session and anti-abuse requirements to the real browser profile.
 */
export async function discoverModels(
  cookies: string,
  accessToken: string | undefined,
  userAgent: string | undefined,
): Promise<ModelInfo[]> {
  void cookies;
  void accessToken;
  void userAgent;

  const page = await getProviderBrowserPage(CHATGPT_ORIGIN);
  const result = await page.evaluate(async (): Promise<BrowserFetchResult> => {
    let token: string | undefined;
    try {
      const sessionResponse = await fetch("/api/auth/session", {
        credentials: "include",
        cache: "no-store",
      });
      if (sessionResponse.ok) {
        const session = (await sessionResponse.json()) as { accessToken?: string };
        token = session.accessToken;
      }
    } catch {
      // The model endpoint can still work through browser cookies alone.
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch("/backend-api/models", {
      credentials: "include",
      cache: "no-store",
      headers,
    });
    return { status: response.status, body: await response.text() };
  });

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`ChatGPT-Modellabfrage im Browser antwortete mit HTTP ${result.status}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(result.body);
  } catch {
    throw new Error("ChatGPT-Modellabfrage lieferte kein gültiges JSON");
  }

  const record = body as Record<string, unknown>;
  const candidates = Array.isArray(record.models) ? record.models : Array.isArray(body) ? body : [];
  if (candidates.length === 0) {
    throw new Error("ChatGPT lieferte keine auswählbaren Modelle");
  }

  return candidates
    .filter((candidate): candidate is Record<string, unknown> => {
      return Boolean(candidate && typeof candidate === "object") && !isUnavailable(candidate as Record<string, unknown>);
    })
    .map((model) => {
      const capabilities = (model.capabilities ?? {}) as Record<string, unknown>;
      const id = String(model.slug ?? model.id ?? "").trim();
      const name = String(
        model.title ?? model.display_name ?? model.name ?? model.slug ?? model.id ?? "",
      ).trim();

      return {
        id,
        name,
        slug: id,
        provider: "chatgpt" as const,
        capabilities: {
          text: true,
          vision:
            capability(capabilities.vision) ||
            capability(capabilities.image_inputs) ||
            capability(model.supports_vision),
          voice:
            capability(capabilities.voice) || capability(model.supports_voice),
          plugins:
            capability(capabilities.plugins) || capability(model.supports_tools),
        },
        maxTokens:
          typeof model.max_tokens === "number"
            ? model.max_tokens
            : typeof model.maxTokenCount === "number"
              ? model.maxTokenCount
              : undefined,
        enabled: true,
      } satisfies ModelInfo;
    })
    .filter((model) => model.id.length > 0 && model.name.length > 0);
}
