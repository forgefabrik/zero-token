import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
} from "./types.js";

/**
 * Abstract interface for AI inference providers.
 *
 * Each provider (ChatGPT, Claude, etc.) implements this interface
 * to translate between the OpenAI-compatible format and the provider's
 * native API.
 */
export interface InferenceProvider {
  /** Provider identifier (e.g. "chatgpt", "claude") */
  readonly provider: string;

  /**
   * Non-streaming chat completion.
   * Returns the complete response once finished.
   */
  chatCompletion(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletionResponse>;

  /**
   * Streaming chat completion.
   * Returns a ReadableStream of chunks for SSE delivery.
   */
  chatCompletionStream(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<ChatCompletionChunk>>;
}

/**
 * Error thrown by inference providers.
 */
export class InferenceError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly provider?: string,
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

export class InferenceAuthError extends InferenceError {
  constructor(provider?: string) {
    super("Authentifizierung fehlgeschlagen – Session abgelaufen?", 401, provider);
    this.name = "InferenceAuthError";
  }
}

export class InferenceRateLimitError extends InferenceError {
  constructor(provider?: string) {
    super("Rate-Limit erreicht – bitte warten.", 429, provider);
    this.name = "InferenceRateLimitError";
  }
}

export class InferenceTimeoutError extends InferenceError {
  constructor(provider?: string) {
    super("Zeitüberschreitung bei der Inferenz.", 504, provider);
    this.name = "InferenceTimeoutError";
  }
}
