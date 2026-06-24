import { describe, expect, it } from "vitest";
import { validateForSave } from "../src/zero-token/accounts/account-validation.js";
import { detectChatGptPlan } from "../src/zero-token/providers/chatgpt-web-auth.js";

function account(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "account_1",
    label: "Test Account",
    provider: "chatgpt",
    cookies: "",
    enabled: true,
    priority: 0,
    sessionStatus: "unknown",
    ...overrides,
  };
}

describe("account session validation", () => {
  it("allows an empty draft account", () => {
    expect(validateForSave(account()).valid).toBe(true);
  });

  it("accepts a valid token-only account", () => {
    expect(
      validateForSave(
        account({
          accessToken: "token-value",
          sessionStatus: "valid",
        }),
      ).valid,
    ).toBe(true);
  });

  it("rejects a valid session without cookies or token", () => {
    const result = validateForSave(account({ sessionStatus: "valid" }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Cookies oder Access-Token müssen vorhanden sein.");
  });
});

describe("ChatGPT plan detection", () => {
  it("detects nested Plus plans", () => {
    expect(detectChatGptPlan({ subscription: { plan: "chatgpt-plus" } })).toBe("plus");
  });

  it("treats business plans as paid", () => {
    expect(detectChatGptPlan({ workspace: { account_type: "business" } })).toBe("pro");
  });

  it("keeps missing plan data unknown", () => {
    expect(detectChatGptPlan({ user: { email: "test@example.invalid" } })).toBe("unknown");
  });
});
