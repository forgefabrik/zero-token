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

export class QwenBrowserProvider implements InferenceProvider {
  readonly provider = "qwen";

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
      const page = await getProviderBrowserPage("https://chat.qwen.ai/");
      await page.goto("https://chat.qwen.ai/", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      const result = await page.evaluate(
        async ({ model, prompt, fid }): Promise<BrowserResponse> => {
          const createResponse = await fetch("/api/v2/chats/new", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (!createResponse.ok) {
            return { status: createResponse.status, body: await createResponse.text() };
          }

          const created = await createResponse.json();
          const chatId =
            created?.data?.id ?? created?.chat_id ?? created?.id ?? created?.chatId;
          if (!chatId) {
            return { status: 502, body: "Qwen lieferte keine Chat-ID." };
          }

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 300_000);
          try {
            const response = await fetch(
              `/api/v2/chat/completions?chat_id=${encodeURIComponent(String(chatId))}`,
              {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "text/event-stream",
                },
                body: JSON.stringify({
                  stream: true,
                  version: "2.1",
                  incremental_output: true,
                  chat_id: chatId,
                  chat_mode: "normal",
                  model,
                  parent_id: null,
                  messages: [
                    {
                      fid,
                      parentId: null,
                      childrenIds: [],
                      role: "user",
                      content: prompt,
                      user_action: "chat",
                      files: [],
                      timestamp: Math.floor(Date.now() / 1000),
                      models: [model],
                      chat_type: "t2t",
                      feature_config: {
                        thinking_enabled: true,
                        output_schema: "phase",
                      },
                    },
                  ],
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
          model: request.model,
          prompt: requestToPrompt(request),
          fid: randomUUID(),
        },
      );

      if (result.status === 401 || result.status === 403) {
        throw new InferenceAuthError("qwen");
      }
      if (result.status === 408) throw new InferenceTimeoutError("qwen");
      if (result.status === 429) throw new InferenceRateLimitError("qwen");
      if (result.status < 200 || result.status >= 300) {
        throw new InferenceError(
          `Qwen Browser-Request antwortete mit HTTP ${result.status}: ${result.body.slice(0, 240)}`,
          result.status,
          "qwen",
        );
      }

      const text = extractTextFromEventStream(result.body);
      if (!text) {
        throw new InferenceError("Qwen lieferte keine auswertbare Textantwort.", 502, "qwen");
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
      const selected = await quotaManager.acquireAccount({ provider: "qwen", modelId });
      if (!selected) {
        throw new InferenceError("Kein aktiver Qwen-Account verfügbar.", 503, "qwen");
      }
      this.accountId = selected.id;
      return selected;
    }

    const account = await getAccount(id);
    if (!account) throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "qwen");
    if (account.provider !== "qwen") {
      throw new InferenceError(`Account gehört nicht zu Qwen: ${id}`, 400, "qwen");
    }
    if (!account.enabled || account.sessionStatus !== "valid") {
      throw new InferenceError(`Account-Session nicht aktiv: ${id}`, 403, "qwen");
    }
    return account;
  }
}
