import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatGPTConversationRequest,
  ChatGPTConversationMessage,
  ChatGPTStreamEvent,
} from "./types.js";
import type { InferenceProvider } from "./inference-provider.js";
import {
  InferenceError,
  InferenceAuthError,
  InferenceRateLimitError,
  InferenceTimeoutError,
} from "./inference-provider.js";
import { getAccount } from "../accounts/account-repository.js";
import logger from "../logger.js";

const CONVERSATION_API = "https://chatgpt.com/backend-api/conversation";
const REQUEST_TIMEOUT = 120_000; // 2 min
const MAX_RETRIES = 2;

/**
 * ChatGPT-Inference-Provider.
 *
 * Übersetzt OpenAI-kompatible ChatCompletionRequests in ChatGPTs
 * backend-api/conversation-Format und parst den SSE-Stream zurück.
 */
export class ChatGPTProvider implements InferenceProvider {
  readonly provider = "chatgpt";

  private accountId: string;

  constructor(accountId?: string) {
    this.accountId = accountId ?? "";
  }

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
    const { quotaManager } = await import("../quota/quota-manager.js");
    await quotaManager.init();

    const account = await this.resolveAccount(request.accountId);
    const convRequest = this.buildConversationRequest(request, account);
    const headers = this.buildHeaders(account);

    try {
      const stream = await this.streamConversation(convRequest, headers, options?.signal);
      await quotaManager.reportSuccess(account.id);
      return stream;
    } catch (err) {
      await quotaManager.reportError(account.id, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  private async resolveAccount(accountId?: string): Promise<ChatGPTPlusAccount> {
    const id = accountId ?? this.accountId;
    if (!id) {
      const { quotaManager } = await import("../quota/quota-manager.js");
      const account = await quotaManager.acquireAccount({ provider: "chatgpt" });
      if (!account) {
        throw new InferenceError("Kein aktiver ChatGPT-Account verfügbar.", 503, "chatgpt");
      }
      this.accountId = account.id;
      return account;
    }

    const account = await getAccount(id);
    if (!account) {
      throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "chatgpt");
    }
    if (!account.enabled) {
      throw new InferenceError(`Account deaktiviert: ${id}`, 403, "chatgpt");
    }
    if (account.sessionStatus !== "valid") {
      throw new InferenceError(`Account-Session ungültig: ${id}`, 403, "chatgpt");
    }
    return account;
  }

  private buildConversationRequest(
    request: ChatCompletionRequest,
    account: ChatGPTPlusAccount,
  ): ChatGPTConversationRequest {
    const messages: ChatGPTConversationMessage[] = request.messages.map((msg, i) => ({
      id: `msg-${Date.now()}-${i}`,
      author: { role: msg.role },
      content: {
        content_type: "text",
        parts: [typeof msg.content === "string" ? msg.content : msg.content.map(p => p.text ?? "").join("\n")],
      },
    }));

    // Map OpenAI model names to ChatGPT slugs
    const modelSlug = this.mapModel(request.model);

    return {
      action: "next",
      messages,
      model: modelSlug,
      parent_message_id: crypto.randomUUID(),
      timezone_offset_min: -new Date().getTimezoneOffset(),
      history_and_training_disabled: true,
    };
  }

  /**
   * Map OpenAI-style model names to ChatGPT backend slugs.
   */
  private mapModel(model: string): string {
    const modelMap: Record<string, string> = {
      "gpt-4o": "gpt-4o",
      "gpt-4o-mini": "gpt-4o-mini",
      "o3": "o3",
      "o4-mini": "o4-mini",
      "gpt-4.1": "gpt-4.1",
      "gpt-4.1-mini": "gpt-4.1-mini",
      "gpt-4.1-nano": "gpt-4.1-nano",
      "chatgpt-4o": "gpt-4o",
      "chatgpt-4o-mini": "gpt-4o-mini",
    };

    return modelMap[model] ?? model;
  }

  private buildHeaders(account: ChatGPTPlusAccount): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "User-Agent": account.userAgent ?? "zero-token/0.1.0",
      Cookie: account.cookies,
      "Accept-Language": "en-US,en;q=0.9",
    };

    if (account.accessToken) {
      headers["Authorization"] = `Bearer ${account.accessToken}`;
    }

    // Add oauth-token if present in cookies
    const oauthMatch = account.cookies.match(/oauth-token=([^;]+)/);
    if (oauthMatch) {
      headers["oauth-token"] = decodeURIComponent(oauthMatch[1]);
    }

    return headers;
  }

  private async streamConversation(
    convRequest: ChatGPTConversationRequest,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<ReadableStream<ChatCompletionChunk>> {
    // Round ID for message correlation
    const roundId = crypto.randomUUID();

    // AbortController for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT);

    // Link external signal
    if (signal) {
      signal.addEventListener("abort", () => abortController.abort());
    }

    let attempts = 0;

    while (attempts <= MAX_RETRIES) {
      attempts++;
      try {
        logger.info(
          { model: convRequest.model, attempt: attempts },
          "Sende Anfrage an ChatGPT backend-api/conversation",
        );

        const response = await fetch(CONVERSATION_API, {
          method: "POST",
          headers,
          body: JSON.stringify(convRequest),
          signal: abortController.signal,
        });

        clearTimeout(timeoutId);

        // Handle error status codes
        if (response.status === 401 || response.status === 403) {
          throw new InferenceAuthError("chatgpt");
        }
        if (response.status === 429) {
          if (attempts <= MAX_RETRIES) {
            const retryAfter = response.headers.get("retry-after");
            const wait = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * attempts;
            logger.warn({ retryAfter: wait }, "Rate-Limited – warte und wiederhole …");
            await new Promise((r) => setTimeout(r, wait));
            continue;
          }
          throw new InferenceRateLimitError("chatgpt");
        }
        if (!response.ok) {
          throw new InferenceError(
            `ChatGPT API antwortete mit HTTP ${response.status}`,
            response.status,
            "chatgpt",
          );
        }

        // Parse SSE stream
        return this.parseSSEStream(response.body!, roundId, convRequest.model);

      } catch (err) {
        clearTimeout(timeoutId);

        if (err instanceof InferenceError) throw err;

        if (err instanceof Error && err.name === "AbortError") {
          throw new InferenceTimeoutError("chatgpt");
        }

        if (attempts <= MAX_RETRIES) {
          logger.warn({ err, attempt: attempts }, "Fehler – wiederhole Anfrage …");
          await new Promise((r) => setTimeout(r, 1000 * attempts));
          continue;
        }

        throw new InferenceError(
          `Anfrage fehlgeschlagen nach ${attempts} Versuchen: ${err instanceof Error ? err.message : String(err)}`,
          500,
          "chatgpt",
        );
      }
    }

    throw new InferenceError("Unerwarteter Fehler im Retry-Loop", 500, "chatgpt");
  }

  /**
   * Parse ChatGPT's SSE stream into ChatCompletionChunks.
   */
  private parseSSEStream(
    body: ReadableStream<Uint8Array>,
    roundId: string,
    model: string,
  ): ReadableStream<ChatCompletionChunk> {
    const decoder = new TextDecoder();
    let buffer = "";

    return new ReadableStream<ChatCompletionChunk>({
      async start(controller) {
        const reader = body.getReader();
        let conversationId: string | undefined;
        let messageId: string = `chatcmpl-${Date.now()}`;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Flush buffer
              processBuffer();
              controller.close();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            processBuffer();
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err }, "Fehler beim Lesen des SSE-Streams");
          controller.error(new Error(errorMsg));
        } finally {
          reader.releaseLock();
        }

        function processBuffer() {
          const lines = buffer.split("\n");
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") {
              // Signal end
              controller.enqueue({
                id: messageId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              });
              continue;
            }

            try {
              const event = JSON.parse(jsonStr) as ChatGPTStreamEvent;

              if (event.type === "error") {
                logger.error({ event }, "ChatGPT SSE-Fehler");
                controller.enqueue({
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant", content: `[Fehler: ${event.error ?? "Unbekannter Fehler"}]` },
                      finish_reason: "stop",
                    },
                  ],
                });
                continue;
              }

              if (event.type === "rate_limit") {
                controller.enqueue({
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant", content: "[Rate-Limit erreicht]" },
                      finish_reason: "stop",
                    },
                  ],
                });
                continue;
              }

              if (event.conversation_id) {
                conversationId = event.conversation_id;
              }

              if (event.type === "final_answer" || event.type === "message") {
                const msg = event.message;
                if (!msg?.content?.parts) continue;

                // For type "message" with recipient "user", skip (these are user messages echoed back)
                if (event.type === "message" && msg.recipient === "user") continue;

                const content = msg.content.parts.join("");
                if (!content) continue;

                if (msg.id) messageId = msg.id;

                controller.enqueue({
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [
                    {
                      index: 0,
                      delta: { role: "assistant", content },
                      finish_reason: null,
                    },
                  ],
                });
              }

              if (event.type === "done") {
                controller.enqueue({
                  id: messageId,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model,
                  choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                });
              }
            } catch {
              // Skip malformed JSON lines
              logger.warn({ line: jsonStr.slice(0, 200) }, "Ungültige SSE-Zeile ignoriert");
            }
          }
        }
      },
    });
  }
}
