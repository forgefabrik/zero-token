import type {
  ProviderDescriptor,
  ProviderAuthFunction,
  ProviderLoginResult,
  ProviderBrowserConfig,
} from "./provider-types.js";
import type { ProviderType } from "../accounts/account-types.js";

/**
 * Provider metadata registry.
 */
export const PROVIDERS: Record<ProviderType, ProviderDescriptor> = {
  chatgpt: {
    id: "chatgpt",
    label: "ChatGPT",
    loginUrl: "https://chatgpt.com",
    requiredPlan: "plus",
    authType: "web-login",
    color: "#10a37f",
  },
  claude: {
    id: "claude",
    label: "Claude",
    loginUrl: "https://claude.ai",
    requiredPlan: "pro",
    authType: "web-login",
    color: "#c9776c",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    loginUrl: "https://gemini.google.com",
    authType: "web-login",
    color: "#4285f4",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    loginUrl: "https://chat.deepseek.com",
    authType: "web-login",
    color: "#4f6ef7",
  },
  grok: {
    id: "grok",
    label: "Grok",
    loginUrl: "https://grok.com",
    authType: "web-login",
    color: "#1c1c1e",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    loginUrl: "https://www.perplexity.ai",
    authType: "web-login",
    color: "#1f1f1f",
  },
  qwen: {
    id: "qwen",
    label: "Qwen",
    loginUrl: "https://chat.qwen.ai",
    authType: "web-login",
    color: "#635bff",
  },
  kimi: {
    id: "kimi",
    label: "Kimi",
    loginUrl: "https://kimi.moonshot.cn",
    authType: "web-login",
    color: "#FF6B35",
  },
  doubao: {
    id: "doubao",
    label: "Doubao",
    loginUrl: "https://www.doubao.com",
    authType: "web-login",
    color: "#00BFFF",
  },
  glm: {
    id: "glm",
    label: "GLM",
    loginUrl: "https://chatglm.cn",
    authType: "web-login",
    color: "#2A7DE1",
  },
  xiaomimo: {
    id: "xiaomimo",
    label: "XiaoMiMo",
    loginUrl: "https://xiaomimo.com",
    authType: "web-login",
    color: "#FF6900",
  },
};

/** Lazy-loaded auth function cache */
const authFunctions = new Map<ProviderType, ProviderAuthFunction>();

/**
 * Load a provider's auth function (lazy import).
 */
async function loadAuthFunction(
  provider: ProviderType,
): Promise<ProviderAuthFunction> {
  if (authFunctions.has(provider)) {
    return authFunctions.get(provider)!;
  }

  let mod: { auth: ProviderAuthFunction };
  switch (provider) {
    case "chatgpt":
      mod = await import("./chatgpt-web-auth.js");
      break;
    case "claude":
      mod = await import("./claude-web-auth.js");
      break;
    case "gemini":
      mod = await import("./gemini-web-auth.js");
      break;
    case "deepseek":
      mod = await import("./deepseek-web-auth.js");
      break;
    case "grok":
      mod = await import("./grok-web-auth.js");
      break;
    case "perplexity":
      mod = await import("./perplexity-web-auth.js");
      break;
    case "qwen":
      mod = await import("./qwen-web-auth.js");
      break;
    case "kimi":
      mod = await import("./kimi-web-auth.js");
      break;
    case "doubao":
      mod = await import("./doubao-web-auth.js");
      break;
    case "glm":
      mod = await import("./glm-web-auth.js");
      break;
    case "xiaomimo":
      mod = await import("./xiaomimo-web-auth.js");
      break;
  }

  authFunctions.set(provider, mod.auth);
  return mod.auth;
}

/**
 * Run the web login flow for a given provider.
 */
export async function login(
  provider: ProviderType,
  config: ProviderBrowserConfig = {},
): Promise<ProviderLoginResult> {
  const authFn = await loadAuthFunction(provider);
  return authFn(config);
}

/**
 * List all supported providers.
 */
export function listProviders(): ProviderDescriptor[] {
  return Object.values(PROVIDERS);
}

/**
 * Get a provider descriptor by id.
 */
export function getProvider(id: ProviderType): ProviderDescriptor | undefined {
  return PROVIDERS[id];
}
