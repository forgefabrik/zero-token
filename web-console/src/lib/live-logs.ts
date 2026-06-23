export type LiveLogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LiveLogEvent {
  id: number;
  time: string;
  level: LiveLogLevel;
  name?: string;
  message: string;
  context?: Record<string, unknown>;
}

export async function loadRecentLogs(limit = 200): Promise<LiveLogEvent[]> {
  const response = await fetch(`/api/logs?limit=${encodeURIComponent(limit)}`);
  if (!response.ok) throw new Error(`Logs konnten nicht geladen werden (HTTP ${response.status})`);
  const payload = (await response.json()) as { logs: LiveLogEvent[] };
  return payload.logs;
}

export function connectLiveLogs(
  onLog: (event: LiveLogEvent) => void,
  onState: (state: "connecting" | "open" | "error") => void,
  tail = 100,
): () => void {
  onState("connecting");
  const source = new EventSource(`/api/logs/stream?tail=${encodeURIComponent(tail)}`);
  source.onopen = () => onState("open");
  source.onerror = () => onState("error");
  source.addEventListener("log", (event) => {
    try {
      onLog(JSON.parse((event as MessageEvent<string>).data) as LiveLogEvent);
    } catch {
      // Keep the stream open when a single event cannot be parsed.
    }
  });
  return () => source.close();
}
