import { createHash, randomUUID } from "node:crypto";
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

const ASSISTANT_IDS: Record<string, string> = {
  "glm-4-plus": "65940acff94777010aa6b796",
  "glm-4": "65940acff94777010aa6b796",
  "glm-4-think": "676411c38945bbc58a905d31",
  "glm-4-zero": "676411c38945bbc58a905d31",
};
const DEFAULT_ASSISTANT_ID = "65940acff94777010aa6b796";
const SIGN_SECRET = "8a1317a7468aa3ad86e997d08f3f31cb";
const X_EXP_GROUPS =
  "na_android_config:exp:NA,na_4o_config:exp:4o_A,tts_config:exp:tts_config_a," +
  "na_glm4plus_config:exp:open,mainchat_server_app:exp:A,mobile_history_daycheck:exp:a," +
  "desktop_toolbar:exp:A,chat_drawing_server:exp:A,drawing_server_cogview:exp:cogview4," +
  "app_welcome_v2:exp:A,chat_drawing_streamv2:exp:A,mainchat_rm_fc:exp:add," +
  "mainchat_dr:exp:open,chat_auto_entrance:exp:A,drawing_server_hi_dream:control:A," +
  "homepage_square:exp:close,assistant_recommend_prompt:exp:3,app_home_regular_user:exp:A," +
  "memory_common:exp:enable,mainchat_moe:exp:300,assistant_greet_user:exp:greet_user," +
  "app_welcome_personalize:exp:A,assistant_model_exp_group:exp:glm4.5," +
  "ai_wallet:exp:ai_wallet_enable";

interface BrowserResponse {
  status: number;
  body: string;
}

function generateSign(): { timestamp: string; nonce: string; sign: string } {
  const raw = Date.now().toString();
  const digits = raw.split("").map(Number);
  const checksum = digits.reduce((sum, value) => sum + value, 0) - digits[digits.length - 2]!;
  const index = checksum % 10;
  const timestamp = raw.slice(0, -2) + index + raw.slice(-1);
  const nonce = randomUUID().replace(/-/g, "");
  const sign = createHash("md5")
    .update(`${timestamp}-${nonce}-${SIGN_SECRET}`)
    .digest("hex");
  return { timestamp, nonce, sign };
}

export class GlmBrowserProvider implements InferenceProvider {
  readonly provider = "glm";
  private readonly deviceId = randomUUID().replace(/-/g, "");

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
      const page = await getProviderBrowserPage("https://chatglm.cn/");
      await page.goto("https://chatglm.cn/", {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });

      const browserCookies = await page.context().cookies(["https://chatglm.cn/"]);
      const cookieAccessToken = browserCookies.find((cookie) => cookie.name === "chatglm_token")?.value;
      const accessToken = cookieAccessToken ?? account.accessToken;
      const sign = generateSign();
      const requestId = randomUUID().replace(/-/g, "");
      const assistantId = ASSISTANT_IDS[request.model] ?? DEFAULT_ASSISTANT_ID;
      const prompt = requestToPrompt(request);

      const result = await page.evaluate(
        async ({
          accessToken,
          assistantId,
          prompt,
          deviceId,
          requestId,
          sign,
          xExpGroups,
        }): Promise<BrowserResponse> => {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "App-Name": "chatglm",
            "X-App-Platform": "pc",
            "X-App-Version": "0.0.1",
            "X-App-fr": "default",
            "X-Device-Brand": "",
            "X-Device-Id": deviceId,
            "X-Device-Model": "",
            "X-Exp-Groups": xExpGroups,
            "X-Lang": "zh",
            "X-Nonce": sign.nonce,
            "X-Request-Id": requestId,
            "X-Sign": sign.sign,
            "X-Timestamp": sign.timestamp,
          };
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 120_000);
          try {
            const response = await fetch("/chatglm/backend-api/assistant/stream", {
              method: "POST",
              credentials: "include",
              headers,
              body: JSON.stringify({
                assistant_id: assistantId,
                conversation_id: "",
                project_id: "",
                chat_type: "user_chat",
                meta_data: {
                  cogview: { rm_label_watermark: false },
                  is_test: false,
                  input_question_type: "xxxx",
                  channel: "",
                  draft_id: "",
                  chat_mode: "zero",
                  is_networking: false,
                  quote_log_id: "",
                  platform: "pc",
                },
                messages: [
                  {
                    role: "user",
                    content: [{ type: "text", text: prompt }],
                  },
                ],
              }),
              signal: controller.signal,
            });
            return { status: response.status, body: await response.text() };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { status: /abort/i.test(message) ? 408 : 500, body: message };
          } finally {
            clearTimeout(timeout);
          }
        },
        {
          accessToken,
          assistantId,
          prompt,
          deviceId: this.deviceId,
          requestId,
          sign,
          xExpGroups: X_EXP_GROUPS,
        },
      );

      if (result.status === 401 || result.status === 403) {
        throw new InferenceAuthError("glm");
      }
      if (result.status === 408) throw new InferenceTimeoutError("glm");
      if (result.status === 429) throw new InferenceRateLimitError("glm");
      if (result.status < 200 || result.status >= 300) {
        throw new InferenceError(
          `GLM Browser-Request antwortete mit HTTP ${result.status}: ${result.body.slice(0, 240)}`,
          result.status,
          "glm",
        );
      }

      const text = extractTextFromEventStream(result.body);
      if (!text) {
        throw new InferenceError("GLM lieferte keine auswertbare Textantwort.", 502, "glm");
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
      const selected = await quotaManager.acquireAccount({ provider: "glm", modelId });
      if (!selected) {
        throw new InferenceError("Kein aktiver GLM-Account verfügbar.", 503, "glm");
      }
      this.accountId = selected.id;
      return selected;
    }

    const account = await getAccount(id);
    if (!account) throw new InferenceError(`Account nicht gefunden: ${id}`, 404, "glm");
    if (account.provider !== "glm") {
      throw new InferenceError(`Account gehört nicht zu GLM: ${id}`, 400, "glm");
    }
    if (!account.enabled || account.sessionStatus !== "valid") {
      throw new InferenceError(`Account-Session nicht aktiv: ${id}`, 403, "glm");
    }
    return account;
  }
}
