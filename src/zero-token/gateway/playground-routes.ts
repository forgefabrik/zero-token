import { Hono } from "hono";
import type { ChatCompletionRequest } from "../inference/types.js";
import { resolveInferenceProvider } from "./inference-dispatch.js";

export function createPlaygroundRoutes(): Hono {
  const app = new Hono();

  app.post("/chat", async (c) => {
    try {
      const request: ChatCompletionRequest = await c.req.json();
      if (!request.model) {
        return c.json({ error: { message: "model ist erforderlich" } }, 400);
      }
      if (!Array.isArray(request.messages) || request.messages.length === 0) {
        return c.json({ error: { message: "messages ist erforderlich" } }, 400);
      }

      const provider = await resolveInferenceProvider(request.model, request.accountId);
      const { toSSEStream } = await import("../inference/stream.js");
      return new Response(
        toSSEStream(await provider.chatCompletionStream({ ...request, stream: true })),
        {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        },
      );
    } catch (error) {
      const status =
        error instanceof Error && "statusCode" in error
          ? Number((error as { statusCode?: number }).statusCode ?? 500)
          : 500;
      return c.json(
        { error: { message: error instanceof Error ? error.message : "Interner Fehler" } },
        status as 400 | 401 | 403 | 404 | 429 | 500 | 503 | 504,
      );
    }
  });

  return app;
}
