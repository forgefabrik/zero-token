import type { Page } from "playwright";
import { createProbeEvidence } from "./candidate-probe-evidence.js";
import { addProbeEvidence } from "./candidate-probe-store.js";

const NETWORK_TYPES = new Set(["fetch", "xhr", "eventsource", "websocket"]);

export function attachCandidateProbeObserver(page: Page, jobId: string): void {
  page.on("request", (request) => {
    const resourceType = request.resourceType();
    if (!NETWORK_TYPES.has(resourceType)) return;
    addProbeEvidence(
      jobId,
      createProbeEvidence({
        method: request.method(),
        url: request.url(),
        resourceType,
      }),
    );
  });

  page.on("response", (response) => {
    const request = response.request();
    const resourceType = request.resourceType();
    if (!NETWORK_TYPES.has(resourceType)) return;
    addProbeEvidence(
      jobId,
      createProbeEvidence({
        method: request.method(),
        url: response.url(),
        resourceType,
        status: response.status(),
        contentType: response.headers()["content-type"],
      }),
    );
  });

  page.on("websocket", (socket) => {
    addProbeEvidence(
      jobId,
      createProbeEvidence({
        method: "GET",
        url: socket.url(),
        resourceType: "websocket",
      }),
    );
  });
}
