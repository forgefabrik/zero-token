import { randomUUID } from "node:crypto";
import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { getAccount } from "../accounts/account-repository.js";
import logger from "../logger.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import { quotaManager } from "../quota/quota-manager.js";
import { singleTextStream } from "./browser-stream-utils.js";
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
  createStatus: number;
  completionStatus: number;
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
    const prompt = lastUserPrompt(request);

    try {
      const page = await getProviderBrowserPage("https://chat.qwen.ai/");
      if (!page.url().includes("chat.qwen.ai")) {
        await page.goto("https://chat.qwen.ai/", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }

      const startedAt = performance.now();
      const result = await page.evaluate(
        async ({ model, prompt, fid }): Promise<BrowserResponse> => {
          const createController = new AbortController();
          const createTimeout = setTimeout(() => createController.abort(), 30_000);
          let createResponse: Response;
          try {
            createResponse = await fetch("https://chat.qwen.ai/api/v2/chats/new", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
              signal: createController.signal,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              createStatus: /abort/i.test(message) ? 408 : 500,
              completionStatus: 0,
              body: message,
            };
          } finally {
            clearTimeout(createTimeout);
          }

          if (!createResponse.ok) {
            return {
              createStatus: createResponse.status,
              completionStatus: 0,
              body: await createResponse.text(),
            };
          }

          const created = await createResponse.json();
          const chatId =
            created?.data?.id ?? created?.chat_id ?? created?.id ?? created?.chatId;
          if (!chatId) {
            return {
              createStatus: createResponse.status,
              completionStatus: 502,
              body: JSON.stringify(created),
            };
          }

          const completionController = new AbortController();
          const completionTimeout = setTimeout(
            () => completionController.abort(),
            300_000,
          );
          try {
            const response = await fetch(
              `https://chat.qwen.ai/api/v2/chat/completions?chat_id=${encodeURIComponent(String(chatId))}`,
              {
                method: "POST",
                credentials: "include",
                cache: "no-store",
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
                signal: completionController.signal,
              },
            );
            return {
              createStatus: createResponse.status,
              completionStatus: response.status,
              body: await response.text(),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              createStatus: createResponse.status,
              completionStatus: /abort/i.test(message) ? 408 : 500,
              body: message,
            };
          } finally {
            clearTimeout(completionTimeout);
          }
        },
        {
          model: request.model,
          prompt,
          fid: randomUUID(),
        },
      );

      logger.info(
        {
          provider: "qwen",
          model: request.model,
          accountId: account.id,
          createEndpoint: "/api/v2/chats/new",
          createStatus: result.createStatus,
          completionEndpoint: "/api/v2/chat/completions",
          completionStatus: result.completionStatus,
          durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        },
        "Qwen-API-Aufrufe abgeschlossen",
      );

      const status = result.completionStatus || result.createStatus;
      if (status === 401 || status === 403) throw new InferenceAuthError("qwen");
      if (status === 408) throw new InferenceTimeoutError("qwen");
      if (status === 429) throw new InferenceRateLimitError("qwen");
      if (status < 200 || status >= 300) {
        throw new InferenceError(
          `Qwen Browser-Request antwortete mit HTTP ${status}: ${result.body.slice(0, 400)}`,
          status,
          "qwen",
        );
      }

      const text = extractQwenAnswer(result.body);
      if (!text) {
        throw new InferenceError(
          `Qwen lieferte keine auswertbare Textantwort. Rohdaten: ${result.body.slice(0, 400)}`,
          502,
          "qwen",
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

function lastUserPrompt(request: ChatCompletionRequest): string {
  const message = [...request.messages].reverse().find((item) => item.role === "user");
  if (!message) {
    throw new InferenceError("Keine Nutzernachricht für Qwen gefunden.", 400, "qwen");
  }
  const prompt =
    typeof message.content === "string"
      ? message.content
      : message.content
          .filter((part) => part.type === "text")
          .map((part) => part.text ?? "")
          .join("");
  if (!prompt.trim()) {
    throw new InferenceError("Die Qwen-Nutzernachricht ist leer.", 400, "qwen");
  }
  return prompt.trim();
}

function extractQwenAnswer(raw: string): string {
  let accumulated = "";

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const event = JSON.parse(payload) as Record<string, unknown>;
      const choices = event.choices as
        | Array<{ delta?: { content?: unknown } }>
        | undefined;
      const value =
        choices?.[0]?.delta?.content ??
        event.text ??
        event.content ??
        event.delta;
      const delta = typeof value === "string" ? value : "";
      if (!delta) continue;
      if (delta.startsWith(accumulated)) accumulated = delta;
      else accumulated += delta;
    } catch {
      // Ignore protocol lines that are not JSON payloads.
    }
  }

  return accumulated
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "")
    .replace(/<think\b[^>]*>[\s\S]*$/gi, "")
    .replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call\s*>/gi, "")
    .trim();
}
