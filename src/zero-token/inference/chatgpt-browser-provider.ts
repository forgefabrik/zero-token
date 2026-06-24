import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { getAccount } from "../accounts/account-repository.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import { quotaManager } from "../quota/quota-manager.js";
import type { InferenceProvider } from "./inference-provider.js";
import {
  InferenceAuthError,
  InferenceError,
  InferenceRateLimitError,
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

export class ChatGPTBrowserProvider implements InferenceProvider {
  readonly provider = "chatgpt";

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
    await quotaManager.init();
    const account = await this.resolveAccount(request.accountId, request.model);

    try {
      const page = await getProviderBrowserPage("https://chatgpt.com/");
      const body = this.buildBody(request);
      const result = await page.evaluate(async (conversationBody): Promise<BrowserResponse> => {
        const sessionResponse = await fetch("/api/auth/session", {
          credentials: "include",
          cache: "no-store",
        });
        if (!sessionResponse.ok) {
          return { status: sessionResponse.status, body: await sessionResponse.text() };
        }

        const session = (await sessionResponse.json()) as {
          accessToken?: string;
          oaiDeviceId?: string;
        };
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "oai-language": "de-DE",
          "oai-device-id": session.oaiDeviceId ?? crypto.randomUUID(),
        };
        if (session.accessToken) {
          headers.Authorization = `Bearer ${session.accessToken}`;
        }

        await fetch("/backend-api/conversation/init", {
          method: "POST",
          credentials: "include",
          headers,
          body: "{}",
        }).catch(() => undefined);

        const response = await fetch("/backend-api/conversation", {
          method: "POST",
          credentials: "include",
          headers,
          body: JSON.stringify(conversationBody),
        });
        return { status: response.status, body: await response.text() };
      }, body);

      if (result.status === 401) throw new InferenceAuthError("chatgpt");
      if (result.status === 429) throw new InferenceRateLimitError("chatgpt");
      if (result.status === 403) {
        const text = await this.sendViaDom(request, options?.signal);
        await quotaManager.reportSuccess(account.id);
        return singleTextStream(request.model, text);
      }
      if (result.status < 200 || result.status >= 300) {
        throw new InferenceError(
          `ChatGPT Browser-Request antwortete mit HTTP ${result.status}`,
          result.status,
          "chatgpt",
        );
      }

      const stream = parseChatGptSse(result.body, request.model);
      await quotaManager.reportSuccess(account.id);
      return stream;
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
      const selected = await quotaManager.acquireAccount({
        provider: "chatgpt",
        modelId,
      });
      if (!selected) {
        throw new InferenceError("Kein aktiver ChatGPT-Account verfügbar.", 503, "chatgpt");
      }
      this.accountId = selected.id;
      return selected;
    }

    const account = await getAccount(id);
    if (!account) throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "chatgpt");
    if (!account.enabled || account.sessionStatus !== "valid") {
      throw new InferenceError(`Account-Session nicht aktiv: ${id}`, 403, "chatgpt");
    }
    return account;
  }

  private buildBody(request: ChatCompletionRequest) {
    return {
      action: "next",
      messages: request.messages.map((message, index) => ({
        id: `msg-${Date.now()}-${index}`,
        author: { role: message.role },
        content: {
          content_type: "text",
          parts: [
            typeof message.content === "string"
              ? message.content
              : message.content.map((part) => part.text ?? "").join("\n"),
          ],
        },
      })),
      model: request.model,
      parent_message_id: crypto.randomUUID(),
      timezone_offset_min: -new Date().getTimezoneOffset(),
      history_and_training_disabled: true,
      force_use_sse: true,
    };
  }

  private async sendViaDom(
    request: ChatCompletionRequest,
    signal?: AbortSignal,
  ): Promise<string> {
    const page = await getProviderBrowserPage("https://chatgpt.com/");
    const lastUser = [...request.messages].reverse().find((message) => message.role === "user");
    const prompt = lastUser
      ? typeof lastUser.content === "string"
        ? lastUser.content
        : lastUser.content.map((part) => part.text ?? "").join("\n")
      : "";
    if (!prompt) throw new InferenceError("Keine Nutzernachricht gefunden.", 400, "chatgpt");

    const selectors = [
      "#prompt-textarea",
      "textarea[placeholder]",
      "textarea",
      '[contenteditable="true"]',
    ];
    let input = null;
    for (const selector of selectors) {
      input = await page.$(selector);
      if (input) break;
    }
    if (!input) throw new InferenceError("ChatGPT-Eingabefeld wurde nicht gefunden.", 503, "chatgpt");

    await input.click();
    await page.keyboard.type(prompt, { delay: 8 });
    await page.keyboard.press("Enter");

    let previous = "";
    let stable = 0;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
      await page.waitForTimeout(1_000);
      const state = await page.evaluate(() => {
        const messages = document.querySelectorAll('[data-message-author-role="assistant"]');
        const current = messages.length ? messages[messages.length - 1]?.textContent?.trim() ?? "" : "";
        const stop = Boolean(document.querySelector('[aria-label*="Stop"], [data-testid*="stop"]'));
        return { current, stop };
      });
      if (state.current && state.current === previous) stable += 1;
      else stable = 0;
      previous = state.current || previous;
      if (previous && !state.stop && stable >= 2) return previous;
    }

    if (!previous) throw new InferenceError("Keine ChatGPT-Antwort erkannt.", 504, "chatgpt");
    return previous;
  }
}

function singleTextStream(model: string, text: string): ReadableStream<ChatCompletionChunk> {
  return new ReadableStream({
    start(controller) {
      const id = `chatcmpl-${Date.now()}`;
      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }],
      });
      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.close();
    },
  });
}

function parseChatGptSse(raw: string, model: string): ReadableStream<ChatCompletionChunk> {
  return new ReadableStream({
    start(controller) {
      const id = `chatcmpl-${Date.now()}`;
      let previous = "";

      for (const line of raw.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data) as any;
          const message = event.message;
          if (message?.author?.role && message.author.role !== "assistant") continue;
          const parts = message?.content?.parts;
          if (!Array.isArray(parts)) continue;
          const current = parts.filter((part: unknown) => typeof part === "string").join("");
          if (!current) continue;
          const delta = current.startsWith(previous) ? current.slice(previous.length) : current;
          previous = current;
          if (!delta) continue;
          controller.enqueue({
            id: message.id ?? id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{ index: 0, delta: { role: "assistant", content: delta }, finish_reason: null }],
          });
        } catch {
          continue;
        }
      }

      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.close();
    },
  });
}
