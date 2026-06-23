import { Writable } from "node:stream";

export type LiveLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LiveLogEvent {
  id: number;
  time: string;
  level: LiveLogLevel;
  name?: string;
  message: string;
  context?: Record<string, unknown>;
}

type LogListener = (event: LiveLogEvent) => void;

const MAX_LOG_EVENTS = 500;
const events: LiveLogEvent[] = [];
const listeners = new Set<LogListener>();
let nextId = 1;

const levelNames: Record<number, LiveLogLevel> = {
  10: "trace",
  20: "debug",
  30: "info",
  40: "warn",
  50: "error",
  60: "fatal",
};

const reservedKeys = new Set(["level", "time", "pid", "hostname", "name", "msg"]);

function normalizeContext(record: Record<string, unknown>): Record<string, unknown> | undefined {
  const context = Object.fromEntries(
    Object.entries(record).filter(([key]) => !reservedKeys.has(key)),
  );
  return Object.keys(context).length > 0 ? context : undefined;
}

function appendEvent(event: Omit<LiveLogEvent, "id">): LiveLogEvent {
  const stored: LiveLogEvent = { id: nextId++, ...event };
  events.push(stored);
  if (events.length > MAX_LOG_EVENTS) events.splice(0, events.length - MAX_LOG_EVENTS);

  for (const listener of listeners) {
    try {
      listener(stored);
    } catch {
      // Log subscribers must never break application logging.
    }
  }
  return stored;
}

export function getRecentLogEvents(limit = 200): LiveLogEvent[] {
  const safeLimit = Math.max(1, Math.min(MAX_LOG_EVENTS, Math.trunc(limit) || 200));
  return events.slice(-safeLimit);
}

export function subscribeToLogEvents(listener: LogListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearLogEvents(): void {
  events.length = 0;
}

export const liveLogStream = new Writable({
  write(chunk, _encoding, callback) {
    try {
      const line = chunk.toString().trim();
      if (!line) {
        callback();
        return;
      }

      const record = JSON.parse(line) as Record<string, unknown>;
      const numericLevel = typeof record.level === "number" ? record.level : 30;
      const timestamp =
        typeof record.time === "number"
          ? new Date(record.time).toISOString()
          : typeof record.time === "string"
            ? record.time
            : new Date().toISOString();

      appendEvent({
        time: timestamp,
        level: levelNames[numericLevel] ?? "info",
        name: typeof record.name === "string" ? record.name : undefined,
        message: typeof record.msg === "string" ? record.msg : "",
        context: normalizeContext(record),
      });
      callback();
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  },
});
