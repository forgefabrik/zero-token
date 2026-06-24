import { createHash } from "node:crypto";
import type { ChatCompletionRequest, ChatMessage } from "./types.js";

export function chatMessageText(message: ChatMessage): string {
  return typeof message.content === "string"
    ? message.content
    : message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text ?? "")
        .join("");
}

function normalizedMessages(messages: ChatMessage[]): string {
  return JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: chatMessageText(message).trim(),
    })),
  );
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function explicitConversationKey(
  request: ChatCompletionRequest,
  accountId: string,
): string | undefined {
  const user = request.user?.trim();
  return user ? `user:${accountId}:${request.model}:${digest(user)}` : undefined;
}

export function historyLookupKey(
  request: ChatCompletionRequest,
  accountId: string,
): string | undefined {
  const messages = [...request.messages];
  const last = messages.at(-1);
  if (!last || last.role !== "user" || messages.length < 2) return undefined;
  messages.pop();
  return `history:${accountId}:${request.model}:${digest(normalizedMessages(messages))}`;
}

export function historyContinuationKey(
  request: ChatCompletionRequest,
  accountId: string,
  assistantText: string,
): string {
  const messages: ChatMessage[] = [
    ...request.messages,
    { role: "assistant", content: assistantText },
  ];
  return `history:${accountId}:${request.model}:${digest(normalizedMessages(messages))}`;
}

export function lastUserPrompt(request: ChatCompletionRequest): string {
  const message = [...request.messages]
    .reverse()
    .find((entry) => entry.role === "user");
  return message ? chatMessageText(message).trim() : "";
}

export function transcriptPrompt(request: ChatCompletionRequest): string {
  return request.messages
    .map((message) => {
      const text = chatMessageText(message).trim();
      if (!text) return "";
      const role =
        message.role === "system"
          ? "System"
          : message.role === "assistant"
            ? "Assistant"
            : "User";
      return `${role}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}
