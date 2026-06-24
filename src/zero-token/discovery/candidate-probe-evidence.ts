import { createHash } from "node:crypto";
import type { CandidateProbeEvidence } from "./candidate-probe-types.js";

const STREAM_CONTENT_TYPES = [
  "text/event-stream",
  "application/x-ndjson",
  "application/ndjson",
  "application/stream+json",
  "application/json-seq",
];

const API_PATH = /\/(?:api|ajax|chat|completion|conversation|message|messages|stream)(?:\/|\b)/i;

export function sanitizeProbeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid-url";
  }
}

export function hasStreamSignal(resourceType: string, contentType = ""): boolean {
  const normalizedType = contentType.toLowerCase().split(";", 1)[0].trim();
  return (
    resourceType === "eventsource" ||
    resourceType === "websocket" ||
    STREAM_CONTENT_TYPES.includes(normalizedType)
  );
}

export function hasApiSignal(url: string, resourceType: string): boolean {
  return ["fetch", "xhr", "eventsource", "websocket"].includes(resourceType) || API_PATH.test(url);
}

export function evidenceId(method: string, url: string, resourceType: string): string {
  return createHash("sha256")
    .update(`${method}\n${url}\n${resourceType}`)
    .digest("hex")
    .slice(0, 16);
}

export function createProbeEvidence(input: {
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  contentType?: string;
}): CandidateProbeEvidence {
  const url = sanitizeProbeUrl(input.url);
  return {
    id: evidenceId(input.method, url, input.resourceType),
    method: input.method.toUpperCase(),
    url,
    resourceType: input.resourceType,
    status: input.status,
    contentType: input.contentType?.split(";", 1)[0].trim() || undefined,
    streamSignal: hasStreamSignal(input.resourceType, input.contentType),
    apiSignal: hasApiSignal(url, input.resourceType),
    firstSeenAt: new Date().toISOString(),
    count: 1,
  };
}
