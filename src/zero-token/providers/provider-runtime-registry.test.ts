import { describe, expect, it } from "vitest";

import {
  getProviderRuntime,
  getProviderRuntimeByPublicApiId,
  isRunnableProvider,
  listProviderRuntimes,
  listRunnableProviders,
  requireProviderRuntime,
} from "./provider-runtime-registry.js";

describe("provider runtime registry", () => {
  it("lists every configured runtime exactly once", () => {
    const runtimes = listProviderRuntimes();
    const providers = listRunnableProviders();

    expect(providers).toEqual(["chatgpt", "claude", "qwen", "glm"]);
    expect(new Set(providers).size).toBe(providers.length);
    expect(runtimes.map((runtime) => runtime.provider)).toEqual(providers);
    expect(new Set(runtimes.map((runtime) => runtime.publicApiId)).size).toBe(
      runtimes.length,
    );
  });

  it("resolves internal and public provider ids", () => {
    expect(getProviderRuntime("claude")?.publicApiId).toBe("claude-web");
    expect(getProviderRuntimeByPublicApiId("  CLAUDE-WEB  ")?.provider).toBe(
      "claude",
    );
    expect(getProviderRuntimeByPublicApiId("qwen-web")?.provider).toBe("qwen");
  });

  it("distinguishes configured and unsupported providers", () => {
    expect(isRunnableProvider("chatgpt")).toBe(true);
    expect(isRunnableProvider("gemini")).toBe(false);
    expect(() => requireProviderRuntime("gemini")).toThrow(
      "Provider besitzt keine ausführbare Runtime: gemini",
    );
  });

  it("rejects an empty public provider id", () => {
    expect(() => getProviderRuntimeByPublicApiId("   ")).toThrow(
      "Öffentliche Provider-ID darf nicht leer sein.",
    );
  });
});
