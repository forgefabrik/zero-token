import type { ModelDiscoverer, ModelInfo } from "../models/model-types.js";
import { getProviderBrowserPage } from "./remote-browser-session.js";

const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-6",
    slug: "claude-sonnet-4-6",
    name: "Claude Sonnet 4.6",
    provider: "claude",
    capabilities: { text: true, vision: true },
    maxTokens: 8192,
    enabled: true,
  },
  {
    id: "claude-opus-4-6",
    slug: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "claude",
    capabilities: { text: true, vision: true },
    maxTokens: 16384,
    enabled: true,
  },
  {
    id: "claude-haiku-4-6",
    slug: "claude-haiku-4-6",
    name: "Claude Haiku 4.6",
    provider: "claude",
    capabilities: { text: true, vision: true },
    maxTokens: 8192,
    enabled: true,
  },
];

export const discoverModels: ModelDiscoverer = async () => {
  const page = await getProviderBrowserPage("https://claude.ai/new");
  if (!page.url().includes("claude.ai")) {
    await page.goto("https://claude.ai/new", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
  }

  const result = await page.evaluate(async () => {
    const response = await fetch("/api/organizations", {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return {
      status: response.status,
      body: await response.text(),
    };
  });

  if (result.status === 401 || result.status === 403) {
    throw new Error("Claude-Browserprofil ist nicht angemeldet oder die Session ist abgelaufen.");
  }
  if (result.status === 404) {
    throw new Error("Claude-Organisations-API antwortete mit HTTP 404; der Account ist noch nicht vollständig initialisiert.");
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Claude-Organisations-API antwortete mit HTTP ${result.status}.`);
  }

  let organizations: unknown;
  try {
    organizations = JSON.parse(result.body);
  } catch {
    throw new Error("Claude lieferte ungültige Organisationsdaten.");
  }
  if (!Array.isArray(organizations) || organizations.length === 0) {
    throw new Error("Claude lieferte keine Organisation für den angemeldeten Account.");
  }

  return CLAUDE_MODELS;
};
