import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();

describe("chatgpt-account-info", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const session = {
    cookies: "session=abc",
    accessToken: "token123",
    userAgent: "test-ua/1.0",
  };

  it("erkennt Plus-Status aus der API-Antwort", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { email: "user@example.com", id: "u_123", name: "Test", plan: "plus" },
        plan: "plus",
      }),
    });

    const { fetchAccountInfo } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    const info = await fetchAccountInfo(session);
    expect(info.plan).toBe("plus");
    expect(info.email).toBe("user@example.com");
    expect(info.userId).toBe("u_123");
  });

  it("erkennt Plus-Status aus user.plan", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { email: "user@example.com", plan: "plus" },
      }),
    });

    const { fetchAccountInfo } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    const info = await fetchAccountInfo(session);
    expect(info.plan).toBe("plus");
  });

  it("erkennt unknown-Plan ohne Plus", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { email: "free@example.com" },
        plan: "free",
      }),
    });

    const { fetchAccountInfo } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    const info = await fetchAccountInfo(session);
    expect(info.plan).toBe("unknown");
  });

  it("sendet Authorization-Header mit AccessToken", async () => {
    let capturedHeaders: Record<string, string> = {};
    mockFetch.mockImplementation(
      async (_url: string, opts: { headers?: Record<string, string> }) => {
        capturedHeaders = opts.headers ?? {};
        return {
          ok: true,
          json: async () => ({ user: { plan: "plus" } }),
        };
      },
    );

    const { fetchAccountInfo } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    await fetchAccountInfo(session);
    expect(capturedHeaders["Authorization"]).toBe("Bearer token123");
    expect(capturedHeaders["Cookie"]).toBe("session=abc");
  });

  it("wirft ChatGPTNotPlusError bei requirePlusPlan mit unknown", async () => {
    const { requirePlusPlan } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    expect(() => requirePlusPlan({ plan: "unknown" })).toThrow("Plus");
  });

  it("wirft nicht bei requirePlusPlan mit plus", async () => {
    const { requirePlusPlan } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    expect(() => requirePlusPlan({ plan: "plus" })).not.toThrow();
  });

  it("gibt ChatGPTNetworkError bei nicht-ok Response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 503,
    });

    const { fetchAccountInfo, ChatGPTNetworkError } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    await expect(fetchAccountInfo(session)).rejects.toThrow(ChatGPTNetworkError);
  });

  it("gibt ChatGPTNetworkError bei Netzwerkfehler", async () => {
    mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

    const { fetchAccountInfo, ChatGPTNetworkError } = await import(
      "../../src/zero-token/providers/chatgpt/chatgpt-account-info.js"
    );

    await expect(fetchAccountInfo(session)).rejects.toThrow(ChatGPTNetworkError);
  });
});
