import { describe, expect, it } from "vitest";
import { listProviders, resolveProvider } from "../src/zero-token/providers/provider-catalog.js";

const REQUIRED_IDS = [
  "chatgpt-web",
  "claude-web",
  "deepseek-web",
  "doubao-web",
  "gemini-web",
  "glm-web",
  "glm-intl-web",
  "grok-web",
  "kimi-web",
  "qwen-web",
  "qwen-cn-web",
  "manus-api",
];

describe("provider catalog", () => {
  it("contains the OpenClaw provider IDs", () => {
    const ids = listProviders().map((provider) => provider.id);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_IDS));
  });

  it("resolves legacy aliases", () => {
    expect(resolveProvider("chatgpt")?.id).toBe("chatgpt-web");
    expect(resolveProvider("glm-intl")?.id).toBe("glm-intl-web");
    expect(resolveProvider("qwen-cn")?.id).toBe("qwen-cn-web");
  });
});
