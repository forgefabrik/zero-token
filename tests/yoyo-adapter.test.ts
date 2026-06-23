import { describe, expect, it } from "vitest";
import {
  buildYoyoArgs,
  normalizeGatewayUrl,
  resolveAgentBinary,
} from "../src/zero-token/agent/yoyo-adapter.js";

describe("Nova yoyo adapter", () => {
  it("uses Nova's local OpenAI-compatible gateway", () => {
    expect(buildYoyoArgs({ model: "gpt-4o" })).toEqual([
      "--provider",
      "custom",
      "--base-url",
      "http://127.0.0.1:3000/v1",
      "--model",
      "gpt-4o",
    ]);
  });

  it("normalizes trailing slashes and forwards explicit agent arguments", () => {
    expect(
      buildYoyoArgs({
        gatewayUrl: "http://localhost:4000/v1///",
        model: "local-model",
        yes: true,
        extraArgs: ["--quiet"],
      }),
    ).toEqual([
      "--provider",
      "custom",
      "--base-url",
      "http://localhost:4000/v1",
      "--model",
      "local-model",
      "--yes",
      "--quiet",
    ]);
  });

  it("supports environment-based binary and gateway overrides", () => {
    const oldBinary = process.env.NOVA_AGENT_BINARY;
    const oldGateway = process.env.NOVA_GATEWAY_URL;
    process.env.NOVA_AGENT_BINARY = "/opt/nova/yoyo";
    process.env.NOVA_GATEWAY_URL = "http://localhost:9000/v1/";

    expect(resolveAgentBinary()).toBe("/opt/nova/yoyo");
    expect(normalizeGatewayUrl()).toBe("http://localhost:9000/v1");

    if (oldBinary === undefined) delete process.env.NOVA_AGENT_BINARY;
    else process.env.NOVA_AGENT_BINARY = oldBinary;
    if (oldGateway === undefined) delete process.env.NOVA_GATEWAY_URL;
    else process.env.NOVA_GATEWAY_URL = oldGateway;
  });
});
