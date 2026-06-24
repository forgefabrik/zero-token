import { randomUUID } from "node:crypto";
import logger from "../logger.js";
import { resolveProviderAccount } from "../providers/provider-account-resolver.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import { quotaManager } from "../quota/quota-manager.js";
import { extractTextFromEventStream, singleTextStream } from "./browser-stream-utils.js";
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

interface BrowserResult {
  status: number;
  body: string;
}

function lastUserPrompt(request: ChatCompletionRequest): string {
  const message = [...request.messages].reverse().find((item) => item.role === "user");
  if (!message) throw new InferenceError("Keine Nutzernachricht gefunden.", 400, "claude");
  const text = typeof message.content === "string"
    ? message.content
    : message.content.filter((part) => part.type === "text").map((part) => part.text ?? "").join("");
  if (!text.trim()) throw new InferenceError("Die Nutzernachricht ist leer.", 400, "claude");
  return text.trim();
}

export class ClaudeOpenClawProvider implements InferenceProvider {
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
    const account = await resolveProviderAccount({
      provider: "claude",
      modelId: request.model,
      requestedAccountId: request.accountId,
      configuredAccountId: this.accountId,
    });
    this.accountId = account.id;

    try {
      const page = await getProviderBrowserPage("https://claude.ai/new");
      if (!page.url().includes("claude.ai")) {
        await page.goto("https://claude.ai/new", { waitUntil: "domcontentloaded", timeout: 30_000 });
      }

      const orgStarted = performance.now();
      const orgResult = await page.evaluate(async ({ deviceId }): Promise<BrowserResult> => {
        const response = await fetch("https://claude.ai/api/organizations", {
          credentials: "include",
          cache: "no-store",
          headers: {
            Accept: "application/json",
            "anthropic-client-platform": "web_claude_ai",
            "anthropic-device-id": deviceId,
          },
        });
        return { status: response.status, body: await response.text() };
      }, { deviceId: this.deviceId });

      logger.info({
        provider: "claude",
        accountId: account.id,
        endpoint: "/api/organizations",
        status: orgResult.status,
        durationMs: Math.round(performance.now() - orgStarted),
      }, "Claude-API-Aufruf abgeschlossen");

      if (orgResult.status === 401 || orgResult.status === 403) throw new InferenceAuthError("claude");
      if (orgResult.status < 200 || orgResult.status >= 300) {
        throw new InferenceError(`Claude organizations HTTP ${orgResult.status}: ${orgResult.body.slice(0, 400)}`, orgResult.status, "claude");
      }

      const organizations = JSON.parse(orgResult.body) as Array<{ uuid?: string }>;
      const organizationId = organizations.find((item) => item.uuid)?.uuid;
      if (!organizationId) throw new InferenceError("Claude lieferte keine Organisation.", 502, "claude");

      const requestedUuid = randomUUID();
      const createStarted = performance.now();
      const createResult = await page.evaluate(async ({ organizationId, requestedUuid, deviceId }): Promise<BrowserResult> => {
        const response = await fetch(
          `https://claude.ai/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations`,
          {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              "anthropic-client-platform": "web_claude_ai",
              "anthropic-device-id": deviceId,
            },
            body: JSON.stringify({ name: `Nova ${new Date().toISOString()}`, uuid: requestedUuid }),
          },
        );
        return { status: response.status, body: await response.text() };
      }, { organizationId, requestedUuid, deviceId: this.deviceId });

      logger.info({
        provider: "claude",
        accountId: account.id,
        organizationId,
        endpoint: "/api/organizations/:org/chat_conversations",
        status: createResult.status,
        durationMs: Math.round(performance.now() - createStarted),
      }, "Claude-API-Aufruf abgeschlossen");

      if (createResult.status === 401 || createResult.status === 403) throw new InferenceAuthError("claude");
      if (createResult.status === 429) throw new InferenceRateLimitError("claude");
      if (createResult.status < 200 || createResult.status >= 300) {
        throw new InferenceError(`Claude create conversation HTTP ${createResult.status}: ${createResult.body.slice(0, 400)}`, createResult.status, "claude");
      }

      const created = JSON.parse(createResult.body) as { uuid?: string };
      const conversationId = created.uuid;
      if (!conversationId) {
        throw new InferenceError(`Claude lieferte keine Conversation-UUID: ${createResult.body.slice(0, 300)}`, 502, "claude");
      }

      const prompt = lastUserPrompt(request);
      const completionStarted = performance.now();
      const completion = await page.evaluate(async ({ organizationId, conversationId, model, prompt, deviceId }): Promise<BrowserResult> => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 180_000);
        try {
          const response = await fetch(
            `https://claude.ai/api/organizations/${encodeURIComponent(organizationId)}/chat_conversations/${encodeURIComponent(conversationId)}/completion`,
            {
              method: "POST",
              credentials: "include",
              cache: "no-store",
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
                attachments: [], files: [], locale: "en-US",
                personalized_styles: [], sync_sources: [], tools: [],
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
      }, { organizationId, conversationId, model: request.model, prompt, deviceId: this.deviceId });

      logger.info({
        provider: "claude",
        accountId: account.id,
        organizationId,
        conversationId,
        model: request.model,
        endpoint: "/api/organizations/:org/chat_conversations/:conversation/completion",
        status: completion.status,
        responsePreview: completion.status >= 400 ? completion.body.slice(0, 300) : undefined,
        durationMs: Math.round(performance.now() - completionStarted),
      }, "Claude-API-Aufruf abgeschlossen");

      if (completion.status === 401) throw new InferenceAuthError("claude");
      if (completion.status === 408) throw new InferenceTimeoutError("claude");
      if (completion.status === 429) throw new InferenceRateLimitError("claude");
      if (completion.status < 200 || completion.status >= 300) {
        throw new InferenceError(`Claude completion HTTP ${completion.status}: ${completion.body.slice(0, 400)}`, completion.status, "claude");
      }

      const text = extractTextFromEventStream(completion.body);
      if (!text) throw new InferenceError(`Claude lieferte keinen Text: ${completion.body.slice(0, 400)}`, 502, "claude");

      await quotaManager.reportSuccess(account.id);
      return singleTextStream(request.model, text);
    } catch (error) {
      await quotaManager.reportError(account.id, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
}
