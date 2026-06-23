export type DiscoveryProviderKind = "web" | "api" | "local";
export type DiscoveryProviderStatus = "supported" | "candidate";

export interface DiscoveryProvider {
  id: string;
  label: string;
  kind: DiscoveryProviderKind;
  status: DiscoveryProviderStatus;
  homepage?: string;
  models: string[];
  source?: string;
}

export const BUILTIN_DISCOVERY_PROVIDERS: DiscoveryProvider[] = [
  { id: "chatgpt-web", label: "ChatGPT Web", kind: "web", status: "supported", models: [] },
  { id: "claude-web", label: "Claude Web", kind: "web", status: "supported", models: [] },
  { id: "gemini-web", label: "Gemini Web", kind: "web", status: "supported", models: [] },
  { id: "deepseek-web", label: "DeepSeek Web", kind: "web", status: "supported", models: [] },
  { id: "grok-web", label: "Grok Web", kind: "web", status: "supported", models: [] },
  { id: "perplexity-web", label: "Perplexity Web", kind: "web", status: "supported", models: [] },
  { id: "qwen-web", label: "Qwen Web", kind: "web", status: "supported", models: [] },
  { id: "qwen-cn-web", label: "Qwen China Web", kind: "web", status: "supported", models: [] },
  { id: "kimi-web", label: "Kimi Web", kind: "web", status: "supported", models: [] },
  { id: "doubao-web", label: "Doubao Web", kind: "web", status: "supported", models: [] },
  { id: "glm-web", label: "GLM China Web", kind: "web", status: "supported", models: [] },
  { id: "glm-intl-web", label: "GLM International Web", kind: "web", status: "supported", models: [] },
  { id: "xiaomimo-web", label: "XiaoMiMo Web", kind: "web", status: "supported", models: [] },
  { id: "manus-api", label: "Manus API", kind: "api", status: "supported", models: [] },
];
