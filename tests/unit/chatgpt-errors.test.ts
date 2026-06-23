import { describe, it, expect } from "vitest";
import {
  ChatGPTError,
  ChatGPTBrowserError,
  ChatGPTLoginTimeoutError,
  ChatGPTNotPlusError,
  ChatGPTSessionError,
  ChatGPTNetworkError,
} from "../../src/zero-token/providers/chatgpt/chatgpt-errors.js";

describe("chatgpt-errors", () => {
  it("ChatGPTError hat korrekten Namen", () => {
    const err = new ChatGPTError("test");
    expect(err.name).toBe("ChatGPTError");
    expect(err.message).toBe("test");
  });

  it("ChatGPTBrowserError speichert cause", () => {
    const cause = new Error("root");
    const err = new ChatGPTBrowserError("browser fail", cause);
    expect(err.name).toBe("ChatGPTBrowserError");
    expect(err.cause).toBe(cause);
  });

  it("ChatGPTLoginTimeoutError enthält Timeout in Nachricht", () => {
    const err = new ChatGPTLoginTimeoutError(300_000);
    expect(err.name).toBe("ChatGPTLoginTimeoutError");
    expect(err.message).toContain("300");
  });

  it("ChatGPTNotPlusError hat erklärende Nachricht", () => {
    const err = new ChatGPTNotPlusError();
    expect(err.name).toBe("ChatGPTNotPlusError");
    expect(err.message).toContain("Plus");
  });

  it("ChatGPTSessionError hat korrekten Namen", () => {
    const err = new ChatGPTSessionError("no session");
    expect(err.name).toBe("ChatGPTSessionError");
  });

  it("ChatGPTNetworkError speichert statusCode", () => {
    const err = new ChatGPTNetworkError("network fail", 503);
    expect(err.name).toBe("ChatGPTNetworkError");
    expect(err.statusCode).toBe(503);
  });
});
