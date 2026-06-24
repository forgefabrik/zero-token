import type { ModelDiscoverer, ModelInfo } from "../models/model-types.js";
import { getProviderBrowserPage } from "./remote-browser-session.js";

const SUPPORTED_MODELS: ModelInfo[] = [
  {
    id: "glm-4-plus",
    slug: "glm-4-plus",
    name: "GLM-4 Plus",
    provider: "glm",
    capabilities: { text: true },
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: "glm-4",
    slug: "glm-4",
    name: "GLM-4",
    provider: "glm",
    capabilities: { text: true },
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: "glm-4-think",
    slug: "glm-4-think",
    name: "GLM-4 Think",
    provider: "glm",
    capabilities: { text: true },
    maxTokens: 4096,
    enabled: true,
  },
  {
    id: "glm-4-zero",
    slug: "glm-4-zero",
    name: "GLM-4 Zero",
    provider: "glm",
    capabilities: { text: true },
    maxTokens: 4096,
    enabled: true,
  },
];

export const discoverModels: ModelDiscoverer = async () => {
  const page = await getProviderBrowserPage("https://chatglm.cn/");
  await page.goto("https://chatglm.cn/", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  const current = new URL(page.url());
  if (/login|signin|auth/i.test(current.pathname)) {
    throw new Error("GLM-Browserprofil ist nicht angemeldet.");
  }

  return SUPPORTED_MODELS;
};
