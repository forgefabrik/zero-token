import { Hono } from "hono";
import {
  clearLogEvents,
  getRecentLogEvents,
  subscribeToLogEvents,
  type LiveLogEvent,
} from "./log-events.js";

function encodeSse(event: LiveLogEvent): Uint8Array {
  return new TextEncoder().encode(`id: ${event.id}\nevent: log\ndata: ${JSON.stringify(event)}\n\n`);
}

export function createLogRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", (c) => {
    const requested = Number(c.req.query("limit") ?? 200);
    const limit = Number.isFinite(requested) ? requested : 200;
    return c.json({ logs: getRecentLogEvents(limit) });
  });

  routes.delete("/", (c) => {
    clearLogEvents();
    return c.json({ success: true });
  });

  routes.get("/stream", (c) => {
    const requestedTail = Number(c.req.query("tail") ?? 100);
    const tail = Number.isFinite(requestedTail) ? requestedTail : 100;
    let cleanup: (() => void) | undefined;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const close = () => {
          if (closed) return;
          closed = true;
          cleanup?.();
          try {
            controller.close();
          } catch {
            // Client may already have closed the stream.
          }
        };

        for (const event of getRecentLogEvents(tail)) {
          controller.enqueue(encodeSse(event));
        }

        const unsubscribe = subscribeToLogEvents((event) => {
          if (!closed) controller.enqueue(encodeSse(event));
        });
        const heartbeat = setInterval(() => {
          if (!closed) controller.enqueue(new TextEncoder().encode(": heartbeat\n\n"));
        }, 15_000);

        cleanup = () => {
          unsubscribe();
          clearInterval(heartbeat);
        };
        c.req.raw.signal.addEventListener("abort", close, { once: true });
      },
      cancel() {
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  return routes;
}
