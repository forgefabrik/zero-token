import { randomUUID } from "node:crypto";
import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { getAccount } from "../accounts/account-repository.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import { quotaManager } from "../quota/quota-manager.js";
import {
  extractTextFromEventStream,
  requestToPrompt,
  singleTextStream,
} from "./browser-stream-utils.js";
import type { InferenceProvider } from "./inference-provider.js";
import {
  InferenceAuthError,
  InferenceError,
  InferenceRateLimitError,
  InferenceTimeoutError,
} from "./inference-provider.js";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./types.js";

interface BrowserResponse {
  status: number;
  body: string;
}

function parseCookieHeader(header: string): Array<{ name: string; value: string; domain: string; path: string }> {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      return {
        name: separator >= 0 ? part.slice(0, separator).trim() : part,
        value: separator >= 0 ? part.slice(separator + 1).trim() : "",
        domain: ".claude.ai",
        path: "/",
      };
    })
    .filter((cookie) => Boolean(cookie.name));
}

export class ClaudeBrowserProvider implements InferenceProvider {
  readonly provider = "claude";
  private readonly deviceId = randomUUID();

  constructor(private accountId = "") {}

  async chatCompletion(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletionResponse> {
    const stream = await this.chatCompletionStream(request, options);
    const { toOpenAIJsonResponse } = await import("./stream.js");
    return toOpenAIJsonResponse(stream);
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<ChatCompletionChunk>> {
    if (options?.signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
    await quotaManager.init();
    const account = await this.resolveAccount(request.accountId, request.model);

    try {
      const page = await getProviderBrowserPage("https://claude.ai/new");
      const cookies = parseCookieHeader(account.cookies);
      if (cookies.length > 0) await page.context().addCookies(cookies);
      if (!page.url().includes("claude.ai")) {
        await page.goto("https://claude.ai/new", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }

      const organization = await page.evaluate(
        async ({ deviceId }): Promise<BrowserResponse> => {
          const response = await fetch("/api/organizations", {
            credentials: "include",
            cache: "no-store",
            headers: {
              Accept: "application/json",
              "anthropic-client-platform": "web_claude_ai",
              "anthropic-device-id": deviceId,
            },
          });
          return { status: response.status, body: await response.text() };
        },
        { deviceId: this.deviceId },
      );

      if (organization.status === 401 || organization.status === 403) {
        throw new InferenceAuthError("claude");
      }
      if (organization.status === 404) {
        throw new InferenceError(
          "Claude-Organisations-API antwortete mit HTTP 404. Öffne Claude einmal vollständig im Remote-Browser und prüfe den Account.",
          502,
          "claude",
        );
      }
      if (organization.status < 200 || organization.status >= 300) {
        throw new InferenceError(
          `Claude-Organisations-API antwortete mit HTTP ${organization.status}: ${organization.body.slice(0, 240)}`,
          organization.status,
          "claude",
        );
      }

      const organizations = JSON.parse(organization.body) as Array<{ uuid?: string }>;
      const organizationId = organizations.find((item) => item.uuid)?.uuid;
      if (!organizationId) {
        throw new InferenceError(
          "Claude lieferte keine Organisation für den angemeldeten Account.",
          502,
          "claude",
        );
      }

      const conversationId = randomUUID();
      const createResult = await page.evaluate(
        async ({ organizationId, conversationId, deviceId }): Promise<BrowserResponse> => {
          const response = await fetch(
            `/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations`,
            {
              method: "POST",
              credentials: "include",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "anthropic-client-platform": "web_claude_ai",
                "anthropic-device-id": deviceId,
              },
              body: JSON.stringify({
                name: `Nova ${new Date().toISOString()}`,
                uuid: conversationId,
              }),
            },
          );
          return { status: response.status, body: await response.text() };
        },
        { organizationId, conversationId, deviceId: this.deviceId },
      );

      if (createResult.status === 401 || createResult.status === 403) {
        throw new InferenceAuthError("claude");
      }
      if (createResult.status === 429) throw new InferenceRateLimitError("claude");
      if (createResult.status < 200 || createResult.status >= 300) {
        throw new InferenceError(
          `Claude Conversation-API antwortete mit HTTP ${createResult.status}: ${createResult.body.slice(0, 240)}`,
          createResult.status,
          "claude",
        );
      }

      const prompt = requestToPrompt(request);
      const completion = await page.evaluate(
        async ({ organizationId, conversationId, model, prompt, deviceId }): Promise<BrowserResponse> => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 180_000);
          try {
            const response = await fetch(
              `/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations/${encodeURIComponent(conversationId)}/completion`,
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream",
                  "anthropic-client-platform": "web_claude_ai",
                  "anthropic-device-id": deviceId,
                },
                body: JSON.stringify({
                  prompt,
                  parent_message_uuid: "00000000-0000-4000-8000-000000000000",
                  model,
                  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  rendering_mode: "messages",
                  attachments: [],
                  files: [],
                  locale: "en-US",
                  personalized_styles: [],
                  sync_sources: [],
                  tools: [],
                }),
                signal: controller.signal,
              },
            );
            return { status: response.status, body: await response.text() };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { status: /abort/i.test(message) ? 408 : 500, body: message };
          } finally {
            clearTimeout(timeout);
          }
        },
        {
          organizationId,
          conversationId,
          model: request.model,
          prompt,
          deviceId: this.deviceId,
        },
      );

      if (completion.status === 401 || completion.status === 403) {
        throw new InferenceAuthError("claude");
      }
      if (completion.status === 408) throw new InferenceTimeoutError("claude");
      if (completion.status === 429) throw new InferenceRateLimitError("claude");
      if (completion.status < 200 || completion.status >= 300) {
        throw new InferenceError(
          `Claude Browser-Request antwortete mit HTTP ${completion.status}: ${completion.body.slice(0, 240)}`,
          completion.status,
          "claude",
        );
      }

      const text = extractTextFromEventStream(completion.body);
      if (!text) {
        throw new InferenceError(
          "Claude lieferte keine auswertbare Textantwort.",
          502,
          "claude",
        );
      }

      await quotaManager.reportSuccess(account.id);
      return singleTextStream(request.model, text);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      await quotaManager.reportError(account.id, normalized);
      throw error;
    }
  }

  private async resolveAccount(
    requestedId: string | undefined,
    modelId: string,
  ): Promise<ChatGPTPlusAccount> {
    const id = requestedId ?? this.accountId;
    if (!id) {
      const selected = await quotaManager.acquireAccount({ provider: "claude", modelId });
      if (!selected) {
        throw new InferenceError("Kein aktiver Claude-Account verfügbar.", 503, "claude");
      }
      this.accountId = selected.id;
      return selected;
    }

    const account = await getAccount(id);
    if (!account) throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "claude");
    if (account.provider !== "claude") {
      throw new InferenceError(`Account gehört nicht zu Claude: ${id}`, 400, "claude");
    }
    if (!account.enabled || account.sessionStatus !== "valid") {
      throw new InferenceError(`Account-Session nicht aktiv: ${id}`, 403, "claude");
    }
    return account;
  }
}
