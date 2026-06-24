import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ChatGPT direct provider", () => {
  it("uses the conversation API without DOM typing fallback", () => {
    const source = readFileSync(
      "src/zero-token/inference/chatgpt-direct-provider.ts",
      "utf8",
    );
    expect(source).toContain("/backend-api/conversation");
    expect(source).toContain("conversation_id");
    expect(source).toContain("parent_message_id");
    expect(source).not.toContain("keyboard.type");
    expect(source).not.toContain("sendViaDom");
  });
});
