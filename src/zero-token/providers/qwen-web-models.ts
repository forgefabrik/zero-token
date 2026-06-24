import type { ModelDiscoverer, ModelInfo } from "../models/model-types.js";
import { getProviderBrowserPage } from "./remote-browser-session.js";

const SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: "qwen3.5-plus",
    slug: "qwen3.5-plus",
    name: "Qwen 3.5 Plus",
    provider: "qwen",
    capabilities: { text: true },
    maxTokens: 8192,
    enabled: true,
  },
  {
    id: "qwen3.5-turbo",
    slug: "qwen3.5-turbo",
    name: "Qwen 3.5 Turbo",
    provider: "qwen",
    capabilities: { text: true },
    maxTokens: 8192,
    enabled: true,
  },
];

export const discoverModels: ModelDiscoverer = async () => {
  const page = await getProviderBrowserPage("https://chat.qwen.ai/");
  await page.goto("https://chat.qwen.ai/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  const current = new URL(page.url());
  if (/login|signin|auth/i.test(current.pathname)) {
    throw new Error("Qwen-Browserprofil ist nicht angemeldet.");
  }

  return SUPPORTED_MODELS;
};
