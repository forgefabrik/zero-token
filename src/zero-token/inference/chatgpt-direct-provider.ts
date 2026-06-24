import { randomUUID } from "node:crypto";
import type { ChatGPTPlusAccount } from "../accounts/account-types.js";
import { getAccount } from "../accounts/account-repository.js";
import logger from "../logger.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import { quotaManager } from "../quota/quota-manager.js";
import {
  explicitConversationKey,
  historyContinuationKey,
  historyLookupKey,
  lastUserPrompt,
  transcriptPrompt,
} from "./chatgpt-conversation-state.js";
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
  sentinelError?: string;
}

interface ConversationState {
  conversationId: string;
  parentMessageId: string;
  updatedAt: number;
}

interface ParsedResponse {
  chunks: ChatCompletionChunk[];
  conversationId?: string;
  parentMessageId?: string;
  fullText: string;
}

const conversationStates = new Map<string, ConversationState>();
const STATE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_STATES = 500;

function pruneStates(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  for (const [key, state] of conversationStates) {
    if (state.updatedAt < cutoff) conversationStates.delete(key);
  }
  if (conversationStates.size <= MAX_STATES) return;
  const oldest = [...conversationStates.entries()]
    .sort((a, b) => a[1].updatedAt - b[1].updatedAt)
    .slice(0, conversationStates.size - MAX_STATES);
  for (const [key] of oldest) conversationStates.delete(key);
}

function clearAccountStates(accountId: string): void {
  const marker = `:${accountId}:`;
  for (const key of conversationStates.keys()) {
    if (key.includes(marker)) conversationStates.delete(key);
  }
}

function resolveState(
  request: ChatCompletionRequest,
  accountId: string,
): {
  state?: ConversationState;
  explicitKey?: string;
  historyKey?: string;
} {
  const explicitKey = explicitConversationKey(request, accountId);
  const historyKey = historyLookupKey(request, accountId);
  const state =
    (explicitKey ? conversationStates.get(explicitKey) : undefined) ??
    (historyKey ? conversationStates.get(historyKey) : undefined);
  return { state, explicitKey, historyKey };
}

export class ChatGPTDirectProvider implements InferenceProvider {
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
    if (options?.signal?.aborted) {
      throw new DOMException("Abgebrochen", "AbortError");
    }

    await quotaManager.init();
    pruneStates();
    const account = await this.resolveAccount(request.accountId, request.model);
    const { state, explicitKey, historyKey } = resolveState(request, account.id);
    const prompt = state ? lastUserPrompt(request) : transcriptPrompt(request);
    if (!prompt) {
      throw new InferenceError(
        "Keine Nutzernachricht für ChatGPT gefunden.",
        400,
        "chatgpt",
      );
    }

    const body = {
      action: "next",
      messages: [
        {
          id: randomUUID(),
          author: { role: "user" },
          content: { content_type: "text", parts: [prompt] },
        },
      ],
      parent_message_id: state?.parentMessageId ?? randomUUID(),
      ...(state?.conversationId
        ? { conversation_id: state.conversationId }
        : {}),
      model: request.model,
      timezone_offset_min: new Date().getTimezoneOffset(),
      history_and_training_disabled: false,
      conversation_mode: { kind: "primary_assistant", plugin_ids: null },
      force_paragen: false,
      force_paragen_model_slug: "",
      force_rate_limit: false,
      reset_rate_limits: false,
      force_use_sse: true,
    };

    try {
      const page = await getProviderBrowserPage("https://chatgpt.com/");
      if (!page.url().includes("chatgpt.com")) {
        await page.goto("https://chatgpt.com/", {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
      }

      const startedAt = performance.now();
      const result = await page.evaluate(
        async ({ conversationBody, referer }): Promise<BrowserResult> => {
          type SentinelModule = {
            bk?: () => Promise<{
              turnstile?: { bx?: string; dx?: string };
            }>;
            bi?: (key: string) => Promise<unknown>;
            bl?: { getEnforcementToken?: (requirements: unknown) => Promise<unknown> };
            bm?: { getEnforcementToken?: (requirements: unknown) => Promise<unknown> };
            fX?: (
              requirements: unknown,
              arkose: unknown,
              turnstile: unknown,
              proof: unknown,
              unused: unknown,
            ) => Promise<Record<string, string>>;
          };

          const sessionResponse = await fetch(
            "https://chatgpt.com/api/auth/session",
            { credentials: "include", cache: "no-store" },
          );
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
          const deviceId = session.oaiDeviceId ?? crypto.randomUUID();
          const baseHeaders = (): Record<string, string> => ({
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "oai-language": "en-US",
            "oai-device-id": deviceId,
            Referer: referer || "https://chatgpt.com/",
            "sec-ch-ua":
              '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
            ...(session.accessToken
              ? { Authorization: `Bearer ${session.accessToken}` }
              : {}),
          });

          const warmup = async () => {
            const headers = baseHeaders();
            for (const endpoint of [
              "https://chatgpt.com/backend-api/conversation/init",
              "https://chatgpt.com/backend-api/sentinel/chat-requirements/prepare",
              "https://chatgpt.com/backend-api/sentinel/chat-requirements/finalize",
            ]) {
              await fetch(endpoint, {
                method: "POST",
                credentials: "include",
                cache: "no-store",
                headers,
                body: "{}",
              }).catch(() => undefined);
            }
          };

          const directRequest = async (headers: Record<string, string>) =>
            fetch("https://chatgpt.com/backend-api/conversation", {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              headers,
              body: JSON.stringify(conversationBody),
            });

          await warmup();
          let response: Response | undefined;
          let sentinelError: string | undefined;

          try {
            const scripts = Array.from(document.scripts);
            const discoveredAsset = scripts
              .map((script) => script.src)
              .find(
                (source) =>
                  source.includes("oaistatic.com") && source.endsWith(".js"),
              );
            const assetUrl =
              discoveredAsset ??
              "https://cdn.oaistatic.com/assets/i5bamk05qmvsi6c3.js";
            const sentinel = (await import(
              /* @vite-ignore */ assetUrl
            )) as SentinelModule;
            if (
              typeof sentinel.bk !== "function" ||
              typeof sentinel.bi !== "function" ||
              typeof sentinel.fX !== "function"
            ) {
              throw new Error(`Sentinel-Exports fehlen: ${assetUrl}`);
            }

            const requirements = await sentinel.bk();
            const turnstileKey =
              requirements?.turnstile?.bx ?? requirements?.turnstile?.dx;
            if (!turnstileKey) {
              throw new Error("Sentinel lieferte keinen Turnstile-Key");
            }

            const turnstile = await sentinel.bi(turnstileKey);
            let arkose: unknown = null;
            let proof: unknown = null;
            try {
              arkose = await sentinel.bl?.getEnforcementToken?.(requirements);
            } catch {
              arkose = null;
            }
            try {
              proof = await sentinel.bm?.getEnforcementToken?.(requirements);
            } catch {
              proof = null;
            }

            const extraHeaders = await sentinel.fX(
              requirements,
              arkose,
              turnstile,
              proof,
              null,
            );
            response = await directRequest({
              ...baseHeaders(),
              ...extraHeaders,
            });
          } catch (error) {
            sentinelError =
              error instanceof Error ? error.message : String(error);
          }

          response ??= await directRequest(baseHeaders());
          return {
            status: response.status,
            body: await response.text(),
            sentinelError,
          };
        },
        { conversationBody: body, referer: page.url() },
      );

      logger.info(
        {
          provider: "chatgpt",
          accountId: account.id,
          model: request.model,
          endpoint: "/backend-api/conversation",
          status: result.status,
          sentinelError: result.sentinelError,
          continuedConversation: Boolean(state),
          continuationSource: state
            ? explicitKey && conversationStates.has(explicitKey)
              ? "user"
              : historyKey
                ? "history"
                : "unknown"
            : "new",
          durationMs: Math.round(performance.now() - startedAt),
        },
        "ChatGPT-API-Aufruf abgeschlossen",
      );

      if (result.status === 401) {
        clearAccountStates(account.id);
        throw new InferenceAuthError("chatgpt");
      }
      if (result.status === 429) {
        throw new InferenceRateLimitError("chatgpt");
      }
      if (result.status < 200 || result.status >= 300) {
        const sentinelHint = result.sentinelError
          ? ` Sentinel: ${result.sentinelError}`
          : "";
        throw new InferenceError(
          `ChatGPT Direct-API antwortete mit HTTP ${result.status}: ${result.body.slice(0, 500)}.${sentinelHint} Es wird bewusst kein DOM-/Tastatur-Fallback verwendet.`,
          result.status,
          "chatgpt",
        );
      }

      const parsed = parseResponse(result.body, request.model);
      if (parsed.conversationId && parsed.parentMessageId) {
        const nextState: ConversationState = {
          conversationId: parsed.conversationId,
          parentMessageId: parsed.parentMessageId,
          updatedAt: Date.now(),
        };
        if (explicitKey) conversationStates.set(explicitKey, nextState);
        if (parsed.fullText) {
          conversationStates.set(
            historyContinuationKey(request, account.id, parsed.fullText),
            nextState,
          );
        }
      }

      await quotaManager.reportSuccess(account.id);
      return chunksToStream(parsed.chunks, request.model);
    } catch (error) {
      await quotaManager.reportError(
        account.id,
        error instanceof Error ? error : new Error(String(error)),
      );
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
      throw new InferenceError(
        `Account nicht gefunden: ${id}`,
        404,
        "chatgpt",
      );
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

function parseResponse(raw: string, model: string): ParsedResponse {
  const chunks: ChatCompletionChunk[] = [];
  const fallbackId = `chatcmpl-${Date.now()}`;
  let accumulated = "";
  let conversationId: string | undefined;
  let parentMessageId: string | undefined;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;

    try {
      const event = JSON.parse(payload) as {
        conversation_id?: string;
        message?: {
          id?: string;
          author?: { role?: string };
          role?: string;
          content?: { parts?: unknown[] };
        };
      };
      if (event.conversation_id) conversationId = event.conversation_id;
      const message = event.message;
      const role = message?.author?.role ?? message?.role;
      if (role && role !== "assistant") continue;
      if (message?.id) parentMessageId = message.id;

      const part = message?.content?.parts?.[0];
      const current =
        typeof part === "string"
          ? part
          : part && typeof part === "object" && "text" in part
            ? String((part as { text?: string }).text ?? "")
            : "";
      if (!current) continue;

      const delta = current.startsWith(accumulated)
        ? current.slice(accumulated.length)
        : current;
      accumulated = current;
      if (!delta) continue;

      chunks.push({
        id: message?.id ?? fallbackId,
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
      // Ignore non-message SSE protocol events.
    }
  }

  return {
    chunks,
    conversationId,
    parentMessageId,
    fullText: accumulated,
  };
}

function chunksToStream(
  chunks: ChatCompletionChunk[],
  model: string,
): ReadableStream<ChatCompletionChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.enqueue({
        id: chunks.at(-1)?.id ?? `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      });
      controller.close();
    },
  });
}
