import type { ProviderId } from "../accounts/account-types.js";
import type { ProviderDescriptor } from "./provider-types.js";

const providerList: ProviderDescriptor[] = [
  { id: "chatgpt-web", implementation: "chatgpt", aliases: ["chatgpt"], label: "ChatGPT Web", loginUrl: "https://chatgpt.com", requiredPlan: "plus", authType: "web-login", color: "#10a37f" },
  { id: "claude-web", implementation: "claude", aliases: ["claude"], label: "Claude Web", loginUrl: "https://claude.ai", requiredPlan: "pro", authType: "web-login", color: "#c9776c" },
  { id: "gemini-web", implementation: "gemini", aliases: ["gemini"], label: "Gemini Web", loginUrl: "https://gemini.google.com", authType: "web-login", color: "#4285f4" },
  { id: "deepseek-web", implementation: "deepseek", aliases: ["deepseek"], label: "DeepSeek Web", loginUrl: "https://chat.deepseek.com", authType: "web-login", color: "#4f6ef7" },
  { id: "grok-web", implementation: "grok", aliases: ["grok"], label: "Grok Web", loginUrl: "https://grok.com", authType: "web-login", color: "#1c1c1e" },
  { id: "perplexity-web", implementation: "perplexity", aliases: ["perplexity"], label: "Perplexity Web", loginUrl: "https://www.perplexity.ai", authType: "web-login", color: "#1f1f1f" },
  { id: "qwen-web", implementation: "qwen", aliases: ["qwen"], label: "Qwen Web (International)", loginUrl: "https://chat.qwen.ai", authType: "web-login", color: "#635bff" },
  { id: "qwen-cn-web", implementation: "qwen-cn", aliases: ["qwen-cn"], label: "Qwen Web (China)", loginUrl: "https://www.qianwen.com", authType: "web-login", color: "#615ced" },
  { id: "kimi-web", implementation: "kimi", aliases: ["kimi"], label: "Kimi Web", loginUrl: "https://kimi.moonshot.cn", authType: "web-login", color: "#ff6b35" },
  { id: "doubao-web", implementation: "doubao", aliases: ["doubao"], label: "Doubao Web", loginUrl: "https://www.doubao.com", authType: "web-login", color: "#00bfff" },
  { id: "glm-web", implementation: "glm", aliases: ["glm"], label: "GLM Web (China)", loginUrl: "https://chatglm.cn", authType: "web-login", color: "#2a7de1" },
  { id: "glm-intl-web", implementation: "glm-intl", aliases: ["glm-intl"], label: "GLM Web (International)", loginUrl: "https://chat.z.ai", authType: "web-login", color: "#246bfd" },
  { id: "xiaomimo-web", implementation: "xiaomimo", aliases: ["xiaomimo"], label: "XiaoMiMo Web", loginUrl: "https://xiaomimo.com", authType: "web-login", color: "#ff6900" },
  { id: "manus-api", implementation: "manus", aliases: ["manus"], label: "Manus API", loginUrl: "https://manus.im", authType: "api-key", color: "#111827" },
];

export const PROVIDERS = Object.fromEntries(
  providerList.map((provider) => [provider.id, provider]),
) as Record<ProviderId, ProviderDescriptor>;

export function listProviders(): ProviderDescriptor[] {
  return [...providerList];
}

export function resolveProvider(id: string): ProviderDescriptor | undefined {
  return PROVIDERS[id as ProviderId] ?? providerList.find((provider) => provider.aliases.includes(id));
}

export function getProvider(id: string): ProviderDescriptor | undefined {
  return resolveProvider(id);
}
