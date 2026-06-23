export type ProviderAuthType = "web-login" | "api-key";

export interface ProviderMeta {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  authType: ProviderAuthType;
  region: "global" | "china";
  color: string;
  aliases: string[];
  plan?: string;
}

export const PROVIDERS: ProviderMeta[] = [
  { id: "chatgpt-web", label: "ChatGPT Web", shortLabel: "ChatGPT", description: "OpenAI ChatGPT über die lokale Browser-Session.", authType: "web-login", region: "global", color: "#10a37f", aliases: ["chatgpt"], plan: "Plus" },
  { id: "claude-web", label: "Claude Web", shortLabel: "Claude", description: "Anthropic Claude über die lokale Browser-Session.", authType: "web-login", region: "global", color: "#d97757", aliases: ["claude"], plan: "Pro" },
  { id: "gemini-web", label: "Gemini Web", shortLabel: "Gemini", description: "Google Gemini über die lokale Browser-Session.", authType: "web-login", region: "global", color: "#4285f4", aliases: ["gemini"] },
  { id: "deepseek-web", label: "DeepSeek Web", shortLabel: "DeepSeek", description: "DeepSeek Chat und Reasoning über die Web-Oberfläche.", authType: "web-login", region: "global", color: "#4f6ef7", aliases: ["deepseek"] },
  { id: "grok-web", label: "Grok Web", shortLabel: "Grok", description: "Grok über eine lokale Browser-Session.", authType: "web-login", region: "global", color: "#d7d7dc", aliases: ["grok"] },
  { id: "perplexity-web", label: "Perplexity Web", shortLabel: "Perplexity", description: "Perplexity über eine lokale Browser-Session.", authType: "web-login", region: "global", color: "#22b8b0", aliases: ["perplexity"] },
  { id: "qwen-web", label: "Qwen Web", shortLabel: "Qwen", description: "Internationale Qwen-Weboberfläche.", authType: "web-login", region: "global", color: "#635bff", aliases: ["qwen"] },
  { id: "qwen-cn-web", label: "Qwen Web China", shortLabel: "Qwen CN", description: "Qianwen-Weboberfläche für China.", authType: "web-login", region: "china", color: "#7c6cf2", aliases: ["qwen-cn"] },
  { id: "kimi-web", label: "Kimi Web", shortLabel: "Kimi", description: "Kimi über die lokale Browser-Session.", authType: "web-login", region: "china", color: "#ff7a45", aliases: ["kimi"] },
  { id: "doubao-web", label: "Doubao Web", shortLabel: "Doubao", description: "Doubao über die lokale Browser-Session.", authType: "web-login", region: "china", color: "#00a8ff", aliases: ["doubao"] },
  { id: "glm-web", label: "GLM Web China", shortLabel: "GLM CN", description: "ChatGLM über chatglm.cn.", authType: "web-login", region: "china", color: "#2a7de1", aliases: ["glm"] },
  { id: "glm-intl-web", label: "GLM Web International", shortLabel: "GLM Intl", description: "GLM über die internationale Oberfläche chat.z.ai.", authType: "web-login", region: "global", color: "#246bfd", aliases: ["glm-intl"] },
  { id: "xiaomimo-web", label: "XiaoMiMo Web", shortLabel: "XiaoMiMo", description: "XiaoMiMo über die lokale Browser-Session.", authType: "web-login", region: "china", color: "#ff6900", aliases: ["xiaomimo"] },
  { id: "manus-api", label: "Manus API", shortLabel: "Manus", description: "Manus über einen lokal gespeicherten API-Schlüssel.", authType: "api-key", region: "global", color: "#8b93a7", aliases: ["manus"] },
];

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((provider) => provider.id === id || provider.aliases.includes(id));
}

export function providerLoginCommand(provider: ProviderMeta): string {
  return provider.authType === "web-login"
    ? `zt login --provider=${provider.id}`
    : `zt config set providers.${provider.id}.apiKey <API_KEY>`;
}
