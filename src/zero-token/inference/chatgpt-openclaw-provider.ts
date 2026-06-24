import { randomUUID } from "node:crypto";
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

interface BrowserResult {
  status: number;
  body: string;
}

export class ChatGPTOpenClawProvider implements InferenceProvider {
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
    const prompt = this.lastUserPrompt(request);

    try {
      const page = await getProviderBrowserPage("https://chatgpt.com/");
      if (!page.url().includes("chatgpt.com")) {
        await page.goto("https://chatgpt.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }

      const body = {
        action: "next",
        messages: [
          {
            id: randomUUID(),
            author: { role: "user" },
            content: {
              content_type: "text",
              parts: [prompt],
            },
          },
        ],
        parent_message_id: randomUUID(),
        model: request.model,
        timezone_offset_min: new Date().getTimezoneOffset(),
        history_and_training_disabled: false,
        conversation_mode: {
          kind: "primary_assistant",
          plugin_ids: null,
        },
        force_paragen: false,
        force_paragen_model_slug: "",
        force_rate_limit: false,
        reset_rate_limits: false,
        force_use_sse: true,
      };

      const result = await page.evaluate(
        async ({ conversationBody, referer }): Promise<BrowserResult> => {
          const sessionResponse = await fetch("https://chatgpt.com/api/auth/session", {
            credentials: "include",
            cache: "no-store",
          });
          if (!sessionResponse.ok) {
            return {
              status: sessionResponse.status,
              body: await sessionResponse.text(),
            };
          }

          const session = (await sessionResponse.json()) as {
            accessToken?: string;
            oaiDeviceId?: string;
          };
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "oai-language": "en-US",
            "oai-device-id": session.oaiDeviceId ?? crypto.randomUUID(),
            Referer: referer || "https://chatgpt.com/",
          };
          if (session.accessToken) {
            headers.Authorization = `Bearer ${session.accessToken}`;
          }

          await fetch("https://chatgpt.com/backend-api/conversation/init", {
            method: "POST",
            credentials: "include",
            headers,
            body: "{}",
          }).catch(() => undefined);

          const response = await fetch(
            "https://chatgpt.com/backend-api/conversation",
            {
              method: "POST",
              credentials: "include",
              headers,
              body: JSON.stringify(conversationBody),
            },
          );
          return {
            status: response.status,
            body: await response.text(),
          };
        },
        { conversationBody: body, referer: page.url() },
      );

      if (result.status === 401) throw new InferenceAuthError("chatgpt");
      if (result.status === 429) throw new InferenceRateLimitError("chatgpt");

      if (result.status === 403 || result.status === 422) {
        const text = await this.sendViaDom(prompt, options?.signal);
        await quotaManager.reportSuccess(account.id);
        return singleTextStream(request.model, text);
      }

      if (result.status < 200 || result.status >= 300) {
        throw new InferenceError(
          `ChatGPT Browser-Request antwortete mit HTTP ${result.status}: ${result.body.slice(0, 400)}`,
          result.status,
          "chatgpt",
        );
      }

      await quotaManager.reportSuccess(account.id);
      return parseSse(result.body, request.model);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      await quotaManager.reportError(account.id, normalized);
      throw error;
    }
  }

  private lastUserPrompt(request: ChatCompletionRequest): string {
    const message = [...request.messages]
      .reverse()
      .find((item) => item.role === "user");
    if (!message) {
      throw new InferenceError("Keine Nutzernachricht gefunden.", 400, "chatgpt");
    }

    const prompt =
      typeof message.content === "string"
        ? message.content
        : message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text ?? "")
            .join("");
    if (!prompt.trim()) {
      throw new InferenceError("Die Nutzernachricht ist leer.", 400, "chatgpt");
    }
    return prompt.trim();
  }

  private async sendViaDom(
    prompt: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const page = await getProviderBrowserPage("https://chatgpt.com/");
    const selectors = [
      "#prompt-textarea",
      "textarea[placeholder]",
      "textarea",
      '[contenteditable="true"]',
    ];

    let input: Awaited<ReturnType<typeof page.$>> = null;
    for (const selector of selectors) {
      input = await page.$(selector);
      if (input) break;
    }
    if (!input) {
      throw new InferenceError(
        "ChatGPT-Eingabefeld wurde nicht gefunden.",
        503,
        "chatgpt",
      );
    }

    await input.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(prompt, { delay: 20 });
    await page.waitForTimeout(500);
    await page.keyboard.press("Enter");

    let text = "";
    let stable = 0;
    for (let elapsed = 0; elapsed < 90_000; elapsed += 2_000) {
      if (signal?.aborted) throw new DOMException("Abgebrochen", "AbortError");
      await page.waitForTimeout(2_000);

      const state = await page.evaluate(() => {
        const clean = (value: string) =>
          value.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
        const elements = document.querySelectorAll(
          'div[data-message-author-role="assistant"], .agent-turn [data-message-author-role="assistant"], [class*="markdown"], [class*="assistant"]',
        );
        const last = elements.length ? elements[elements.length - 1] : null;
        const current = last ? clean(last.textContent ?? "") : "";
        const streaming = Boolean(
          document.querySelector(
            'button.bg-black .icon-lg, [aria-label*="Stop"], [data-testid*="stop"]',
          ),
        );
        return { current, streaming };
      });

      if (state.current && state.current !== text) {
        text = state.current;
        stable = 0;
      } else if (state.current) {
        stable += 1;
      }

      if (text && !state.streaming && stable >= 2) return text;
    }

    if (!text) {
      throw new InferenceError("Keine ChatGPT-Antwort erkannt.", 504, "chatgpt");
    }
    return text;
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
        throw new InferenceError(
          "Kein aktiver ChatGPT-Account verfügbar.",
          503,
          "chatgpt",
        );
      }
      this.accountId = selected.id;
      return selected;
    }

    const account = await getAccount(id);
    if (!account) {
      throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "chatgpt");
    }
    if (account.provider !== "chatgpt") {
      throw new InferenceError(
        `Account gehört nicht zu ChatGPT: ${id}`,
        400,
        "chatgpt",
      );
    }
    if (!account.enabled || account.sessionStatus !== "valid") {
      throw new InferenceError(
        `Account-Session nicht aktiv: ${id}`,
        403,
        "chatgpt",
      );
    }
    return account;
  }
}

function singleTextStream(
  model: string,
  text: string,
): ReadableStream<ChatCompletionChunk> {
  return new ReadableStream({
    start(controller) {
      const id = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: null,
          },
        ],
      });
      controller.enqueue({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.close();
    },
  });
}

function parseSse(
  raw: string,
  model: string,
): ReadableStream<ChatCompletionChunk> {
  return new ReadableStream({
    start(controller) {
      const id = `chatcmpl-${Date.now()}`;
      let accumulated = "";

      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const event = JSON.parse(payload) as {
            message?: {
              id?: string;
              author?: { role?: string };
              role?: string;
              content?: { parts?: unknown[] };
            };
          };
          const message = event.message;
          const role = message?.author?.role ?? message?.role;
          if (role && role !== "assistant") continue;

          const firstPart = message?.content?.parts?.[0];
          const current =
            typeof firstPart === "string"
              ? firstPart
              : firstPart &&
                  typeof firstPart === "object" &&
                  "text" in firstPart
                ? String((firstPart as { text?: string }).text ?? "")
                : "";
          if (!current) continue;

          const delta = current.startsWith(accumulated)
            ? current.slice(accumulated.length)
            : current;
          accumulated = current;
          if (!delta) continue;

          controller.enqueue({
            id: message?.id ?? id,
            object: "chat.completion.chunk",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: delta },
                finish_reason: null,
              },
            ],
          });
        } catch {
          // Ignore malformed event lines.
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
