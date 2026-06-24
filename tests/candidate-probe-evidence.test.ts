import { describe, expect, it } from "vitest";
import {
  createProbeEvidence,
  hasStreamSignal,
  sanitizeProbeUrl,
} from "../src/zero-token/discovery/candidate-probe-evidence.js";

describe("candidate probe evidence", () => {
  it("removes query values and fragments", () => {
    expect(sanitizeProbeUrl("https://example.com/api/chat?value=sample#result")).toBe(
      "https://example.com/api/chat",
    );
  });

  it("recognizes explicit streaming transports only", () => {
    expect(hasStreamSignal("fetch", "text/event-stream; charset=utf-8")).toBe(true);
    expect(hasStreamSignal("websocket")).toBe(true);
    expect(hasStreamSignal("fetch", "application/json")).toBe(false);
  });

  it("keeps only technical metadata", () => {
    const evidence = createProbeEvidence({
      method: "post",
      url: "https://example.com/v1/chat?value=sample",
      resourceType: "fetch",
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
    });

    expect(evidence).toMatchObject({
      method: "POST",
      url: "https://example.com/v1/chat",
      status: 200,
      contentType: "application/x-ndjson",
      streamSignal: true,
      apiSignal: true,
    });
  });
});
