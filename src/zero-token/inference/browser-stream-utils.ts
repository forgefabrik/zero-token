import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ContentPart,
} from "./types.js";

export function requestToPrompt(request: ChatCompletionRequest): string {
  return request.messages
    .map((message) => {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.map(contentPartToText).filter(Boolean).join("\n");
      return `${message.role.toUpperCase()}: ${content}`;
    })
    .join("\n\n");
}

function contentPartToText(part: ContentPart): string {
  if (part.type === "text") return part.text ?? "";
  if (part.type === "image_url") return part.image_url?.url ? `[Bild: ${part.image_url.url}]` : "";
  return "";
}

export function singleTextStream(
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

export function extractTextFromEventStream(raw: string): string {
  let accumulated = "";
  let longest = "";

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line === "[DONE]" || line === "data: [DONE]") continue;
    const payload = line.startsWith("data:") ? line.slice(5).trim() : line;
    if (!payload || payload === "[DONE]") continue;

    try {
      const value = JSON.parse(payload);
      const candidates = collectTextCandidates(value);
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.length > longest.length) longest = candidate;
        if (!accumulated.endsWith(candidate)) {
          if (candidate.startsWith(accumulated)) accumulated = candidate;
          else if (!accumulated.includes(candidate)) accumulated += candidate;
        }
      }
    } catch {
      if (!looksLikeProtocolMetadata(payload) && payload.length > longest.length) {
        longest = payload;
      }
    }
  }

  const result = longest.length >= accumulated.length ? longest : accumulated;
  return result.trim();
}

function collectTextCandidates(value: unknown): string[] {
  const candidates: string[] = [];
  const seen = new Set<unknown>();

  const visit = (current: unknown, key = "") => {
    if (current === null || current === undefined || seen.has(current)) return;
    if (typeof current === "string") {
      if (isTextKey(key) && !looksLikeProtocolMetadata(current)) candidates.push(current);
      return;
    }
    if (typeof current !== "object") return;
    seen.add(current);

    if (Array.isArray(current)) {
      for (const item of current) visit(item, key);
      return;
    }

    for (const [childKey, childValue] of Object.entries(current as Record<string, unknown>)) {
      visit(childValue, childKey);
    }
  };

  visit(value);
  return candidates;
}

function isTextKey(key: string): boolean {
  return /^(text|content|answer|output|delta|response|message|result)$/i.test(key);
}

function looksLikeProtocolMetadata(value: string): boolean {
  const text = value.trim();
  return (
    !text ||
    /^https?:\/\//i.test(text) ||
    /^[0-9a-f-]{20,}$/i.test(text) ||
    /^(assistant|user|system|done|finish|stop|success|normal|phase)$/i.test(text)
  );
}
