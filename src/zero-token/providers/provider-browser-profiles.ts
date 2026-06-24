import logger from "../logger.js";

const PROFILE_BY_HOST: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  "claude.ai": "claude",
  "gemini.google.com": "gemini",
  "chat.deepseek.com": "deepseek",
  "grok.com": "grok",
  "www.perplexity.ai": "perplexity",
  "perplexity.ai": "perplexity",
  "chat.qwen.ai": "qwen",
  "www.qianwen.com": "qwen-cn",
  "qianwen.com": "qwen-cn",
  "kimi.moonshot.cn": "kimi",
  "www.doubao.com": "doubao",
  "doubao.com": "doubao",
  "chatglm.cn": "glm",
  "chat.z.ai": "glm-intl",
  "xiaomimo.com": "xiaomimo",
};

export interface ProviderBrowserProfile {
  profile: string;
  cdpPort: number;
  cdpUrl: string;
  running: boolean;
  profileDir?: string;
  url?: string;
}

export function providerProfileForUrl(targetUrl: string): string {
  const hostname = new URL(targetUrl).hostname.toLowerCase();
  const profile = PROFILE_BY_HOST[hostname];
  if (!profile) {
    throw new Error(`Kein Browserprofil für Host registriert: ${hostname}`);
  }
  return profile;
}

export async function ensureProviderBrowserProfile(
  targetUrl: string,
  options: { reset?: boolean; fallbackCdpUrl?: string } = {},
): Promise<ProviderBrowserProfile> {
  const profile = providerProfileForUrl(targetUrl);
  const managerUrl = (
    process.env.NOVA_BROWSER_MANAGER_URL ?? "http://remote-browser:9221"
  ).replace(/\/+$/, "");
  const action = options.reset ? "reset" : "start";

  try {
    const response = await fetch(
      `${managerUrl}/profiles/${encodeURIComponent(profile)}/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: targetUrl }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const body = (await response.json()) as {
      profile?: string;
      cdpPort?: number;
      running?: boolean;
      profileDir?: string;
      url?: string;
      error?: string;
    };
    if (!response.ok || !body.cdpPort) {
      throw new Error(body.error ?? `HTTP ${response.status}`);
    }

    const cdpHost =
      process.env.NOVA_BROWSER_CDP_HOST ?? new URL(managerUrl).hostname;
    const result: ProviderBrowserProfile = {
      profile,
      cdpPort: body.cdpPort,
      cdpUrl: `http://${cdpHost}:${body.cdpPort}`,
      running: body.running !== false,
      profileDir: body.profileDir,
      url: body.url,
    };
    logger.info(
      {
        providerProfile: profile,
        cdpUrl: result.cdpUrl,
        reset: Boolean(options.reset),
      },
      "Isoliertes Provider-Browserprofil bereit",
    );
    return result;
  } catch (error) {
    const fallback =
      options.fallbackCdpUrl ??
      process.env.NOVA_CDP_URL ??
      "http://remote-browser:9222";
    logger.warn(
      {
        providerProfile: profile,
        managerUrl,
        fallbackCdpUrl: fallback,
        error: error instanceof Error ? error.message : String(error),
      },
      "Profilmanager nicht erreichbar; verwende CDP-Fallback",
    );
    return {
      profile,
      cdpPort: Number(new URL(fallback).port || 9222),
      cdpUrl: fallback,
      running: true,
      url: targetUrl,
    };
  }
}
