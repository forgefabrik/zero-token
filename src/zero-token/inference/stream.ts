import type {
  ChatCompletionChunk,
  ChatCompletionResponse,
} from "./types.js";

/**
 * Converts a stream of chunks into a complete ChatCompletionResponse
 * (for non-streaming requests).
 */
export async function toOpenAIJsonResponse(
  stream: ReadableStream<ChatCompletionChunk>,
): Promise<ChatCompletionResponse> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let model = "";
  let id = "";
  let created = 0;
  let finishReason: "stop" | "length" | "content_filter" | null = null;
  let usage: ChatCompletionResponse["usage"];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (value.choices[0]?.delta?.content) {
        fullContent += value.choices[0].delta.content;
      }
      if (value.choices[0]?.finish_reason) {
        finishReason = value.choices[0].finish_reason;
      }
      if (value.id) id = value.id;
      if (value.model) model = value.model;
      if (value.created) created = value.created;
    }
  } finally {
    reader.releaseLock();
  }

  return {
    id: id || `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: created || Math.floor(Date.now() / 1000),
    model: model || "unknown",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: fullContent,
        },
        finish_reason: finishReason ?? "stop",
      },
    ],
    usage,
  };
}

/**
 * Encodes ChatCompletionChunks as SSE (text/event-stream) bytes.
 */
export function toSSEStream(
  stream: ReadableStream<ChatCompletionChunk>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = stream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const data = JSON.stringify(value);
          const sse = `data: ${data}\n\n`;
          controller.enqueue(encoder.encode(sse));
        }

        // Signal stream end
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const errorEvent = `data: {"error": "${errorMsg}"}\n\n`;
        controller.enqueue(encoder.encode(errorEvent));
        controller.close();
      } finally {
        reader.releaseLock();
      }
    },
  });
}

/**
 * Build an error SSE event.
 */
export function toSSEError(message: string, code?: string): string {
  const error = code ? { message, code } : { message };
  return `data: ${JSON.stringify({ error })}\n\n`;
}
