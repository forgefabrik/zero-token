import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLogEvents,
  getRecentLogEvents,
  liveLogStream,
  subscribeToLogEvents,
} from "../src/zero-token/logging/log-events.js";

function writeLog(record: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    liveLogStream.write(`${JSON.stringify(record)}\n`, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

beforeEach(() => clearLogEvents());

describe("live log event bus", () => {
  it("normalizes Pino records for the web stream", async () => {
    await writeLog({
      level: 40,
      time: Date.UTC(2026, 5, 24),
      name: "nova",
      msg: "provider warning",
      provider: "chatgpt-web",
    });

    expect(getRecentLogEvents()).toEqual([
      expect.objectContaining({
        id: expect.any(Number),
        level: "warn",
        name: "nova",
        message: "provider warning",
        context: { provider: "chatgpt-web" },
      }),
    ]);
  });

  it("notifies subscribers without exposing Pino metadata as context", async () => {
    const received: string[] = [];
    const unsubscribe = subscribeToLogEvents((event) => received.push(event.message));

    await writeLog({ level: 30, pid: 1, hostname: "local", msg: "ready" });
    unsubscribe();
    await writeLog({ level: 30, msg: "ignored" });

    expect(received).toEqual(["ready"]);
    expect(getRecentLogEvents()[0].context).toBeUndefined();
  });

  it("keeps only the latest 500 entries", async () => {
    for (let index = 0; index < 510; index += 1) {
      await writeLog({ level: 20, msg: `entry-${index}` });
    }

    const logs = getRecentLogEvents(500);
    expect(logs).toHaveLength(500);
    expect(logs[0].message).toBe("entry-10");
    expect(logs.at(-1)?.message).toBe("entry-509");
  });
});
