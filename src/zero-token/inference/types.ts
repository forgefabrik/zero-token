// ---------------------------------------------------------------------------
// OpenAI-kompatible Typen für Chat Completions API
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  user?: string;
  // Non-standard, for multi-account
  accountId?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
}

// ---------------------------------------------------------------------------
// ChatGPT-spezifische Typen für backend-api/conversation
// ---------------------------------------------------------------------------

export interface ChatGPTConversationRequest {
  action: "next";
  messages: ChatGPTConversationMessage[];
  model: string;
  parent_message_id: string;
  conversation_id?: string;
  timezone_offset_min: number;
  suggestions?: string[];
  history_and_training_disabled?: boolean;
}

export interface ChatGPTConversationMessage {
  id: string;
  author: { role: "user" | "assistant" | "system" };
  content: {
    content_type: "text";
    parts: string[];
  };
}

export interface ChatGPTStreamEvent {
  type: "message" | "final_answer" | "moderation" | "done" | "error" | "rate_limit" | "usage";
  message?: {
    id: string;
    author?: { role: string };
    content?: { content_type?: string; parts?: string[] };
    recipient: string;
    metadata?: Record<string, unknown>;
  };
  conversation_id?: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type ContentType = "text" | "vision" | "voice";
