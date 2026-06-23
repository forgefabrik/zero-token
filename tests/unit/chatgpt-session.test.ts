import { describe, it, expect, vi } from "vitest";

describe("chatgpt-session", () => {
  it("extrahiert Session-Cookies und User-Agent", async () => {
    const evaluateMock = vi.fn().mockImplementation(
      (_fn: unknown, key?: string) => {
        // When called for localStorage lookup with a key
        if (key === "accessToken") return "bearer_token_abc";
        if (key === "oidc.accessToken") return null;
        if (key === "next-auth.accessToken") return null;
        if (key === "__session") return null;
        // When called for navigator.userAgent (no key arg)
        return "test-ua/1.0";
      },
    );

    const page = {
      context: () => ({
        cookies: vi.fn().mockResolvedValue([
          { name: "__Secure-next-auth.session-token", value: "token123" },
          { name: "__cf_bm", value: "cf123" },
          { name: "some_other", value: "irrelevant" },
        ]),
      }),
      evaluate: evaluateMock,
    };

    const { extractSessionData } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-session.js"
    );

    const result = await extractSessionData(page as any);

    expect(result.cookies).toContain("__Secure-next-auth.session-token=token123");
    expect(result.cookies).toContain("__cf_bm=cf123");
    expect(result.userAgent).toBe("test-ua/1.0");
    expect(result.accessToken).toBe("bearer_token_abc");
  });

  it("funktioniert auch ohne bekannte Session-Cookies", async () => {
    const evaluateMock = vi.fn().mockImplementation(
      (_fn: unknown, key?: string) => {
        if (key === "accessToken") return null;
        if (key === "oidc.accessToken") return null;
        if (key === "next-auth.accessToken") return null;
        if (key === "__session") return null;
        return "test-ua/1.0";
      },
    );

    const page = {
      context: () => ({
        cookies: vi.fn().mockResolvedValue([
          { name: "some_random", value: "value1" },
          { name: "another", value: "value2" },
        ]),
      }),
      evaluate: evaluateMock,
    };

    const { extractSessionData } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-session.js"
    );

    const result = await extractSessionData(page as any);
    expect(result.cookies).toContain("some_random=value1");
    expect(result.accessToken).toBeUndefined();
  });
});
