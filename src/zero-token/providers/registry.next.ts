import type { ProviderAuthFunction, ProviderBrowserConfig, ProviderLoginResult } from "./provider-types.js";
import type { ProviderType } from "../accounts/account-types.js";
import { resolveProvider } from "./provider-catalog.js";

export { PROVIDERS, getProvider, listProviders, resolveProvider } from "./provider-catalog.js";

const loaders: Partial<Record<ProviderType, () => Promise<{ auth: ProviderAuthFunction }>>> = {
  chatgpt: () => import("./chatgpt-web-auth.js"),
  claude: () => import("./claude-web-auth.js"),
  gemini: () => import("./gemini-web-auth.js"),
  deepseek: () => import("./deepseek-web-auth.js"),
  grok: () => import("./grok-web-auth.js"),
  perplexity: () => import("./perplexity-web-auth.js"),
  qwen: () => import("./qwen-web-auth.js"),
  "qwen-cn": () => import("./qwen-cn-web-auth.js"),
  kimi: () => import("./kimi-web-auth.js"),
  doubao: () => import("./doubao-web-auth.js"),
  glm: () => import("./glm-web-auth.js"),
  "glm-intl": () => import("./glm-intl-web-auth.js"),
  xiaomimo: () => import("./xiaomimo-web-auth.js"),
};

export async function login(providerId: string, config: ProviderBrowserConfig = {}): Promise<ProviderLoginResult> {
  const provider = resolveProvider(providerId);
  if (!provider) return { ok: false, reason: "unknown-provider" };
  if (provider.authType === "api-key") return { ok: false, reason: "configuration-required" };

  const load = loaders[provider.implementation];
  if (!load) return { ok: false, reason: "unknown-provider" };
  const { auth } = await load();
  return auth(config);
}
