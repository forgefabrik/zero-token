import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ChatCompletionRequest } from "../inference/types.js";
import logger from "../logger.js";

export interface GatewayOptions {
  host?: string;
  port?: number;
  logLevel?: string;
  cors?: boolean;
}

const DEFAULT_OPTIONS: Required<GatewayOptions> = {
  host: "127.0.0.1",
  port: 3000,
  logLevel: "info",
  cors: true,
};

/**
 * Creates and configures the Hono gateway app.
 */
export function createGateway(options: GatewayOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const app = new Hono();

  // CORS
  if (opts.cors) {
    app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"] }));
  }

  // Health
  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  // Ready
  app.get("/ready", async (c) => {
    try {
      const { getCachedModels } = await import("../models/model-cache.js");
      const models = await getCachedModels();
      const ready = models !== null && models.length > 0;
      return c.json({
        ready,
        models: models?.length ?? 0,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return c.json({ ready: false, timestamp: new Date().toISOString() }, 503);
    }
  });

  // GET /v1/models
  app.get("/v1/models", async (c) => {
    try {
      const { listModels } = await import("../models/model-service.js");
      const models = await listModels();
      return c.json({
        object: "list",
        data: models.map((m) => ({
          id: m.id,
          object: "model",
          created: Math.floor(Date.now() / 1000),
          owned_by: m.provider,
          capabilities: m.capabilities,
        })),
      });
    } catch (err) {
      logger.error({ err }, "Fehler bei /v1/models");
      return c.json({ error: { message: "Fehler beim Abrufen der Modelle" } }, 500);
    }
  });

  // POST /v1/chat/completions
  app.post("/v1/chat/completions", async (c) => {
    try {
      const body: ChatCompletionRequest = await c.req.json();

      // Validate
      if (!body.model) {
        return c.json({ error: { message: "model ist erforderlich" } }, 400);
      }
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return c.json({ error: { message: "messages ist erforderlich" } }, 400);
      }

      const provider = new (await import("../inference/chatgpt-provider.js")).ChatGPTProvider(body.accountId);

      if (body.stream) {
        return handleStreamingResponse(c, provider, body);
      } else {
        const response = await provider.chatCompletion(body);
        return c.json(response);
      }
    } catch (err) {
      logger.error({ err }, "Fehler bei /v1/chat/completions");
      const status = err instanceof Error && "statusCode" in err ? (err as any).statusCode : 500;
      return c.json(
        { error: { message: err instanceof Error ? err.message : "Interner Fehler" } },
        status,
      );
    }
  });

  // POST /v1/responses (API parity – same core)
  app.post("/v1/responses", async (c) => {
    // responses API is essentially the same as chat/completions
    // but with a different request/response format. For now, normalize to chat completions.
    try {
      const body: Record<string, unknown> = await c.req.json();
      const input = body.input ?? body.messages ?? [];
      const model = (body.model as string) ?? "gpt-4o";

      const chatRequest: ChatCompletionRequest = {
        model,
        messages: Array.isArray(input)
          ? input.map((m: any) => ({ role: m.role ?? "user", content: m.content ?? "" }))
          : [{ role: "user", content: String(input) }],
        stream: body.stream as boolean | undefined,
      };

      const provider = new (await import("../inference/chatgpt-provider.js")).ChatGPTProvider();

      if (chatRequest.stream) {
        return handleStreamingResponse(c, provider, chatRequest);
      } else {
        const response = await provider.chatCompletion(chatRequest);
        return c.json({
          id: response.id,
          object: "response",
          created: response.created,
          model: response.model,
          output: response.choices.map((c) => ({
            role: c.message.role,
            content: c.message.content,
          })),
          usage: response.usage,
        });
      }
    } catch (err) {
      logger.error({ err }, "Fehler bei /v1/responses");
      const status = err instanceof Error && "statusCode" in err ? (err as any).statusCode : 500;
      return c.json(
        { error: { message: err instanceof Error ? err.message : "Interner Fehler" } },
        status,
      );
    }
  });

  return { app, options: opts };
}

/**
 * Handle a streaming chat completion request via SSE.
 */
async function handleStreamingResponse(
  c: any,
  provider: any,
  request: ChatCompletionRequest,
): Promise<Response> {
  const stream = await provider.chatCompletionStream(request);
  const { toSSEStream } = await import("../inference/stream.js");
  const sseStream = toSSEStream(stream);

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Start the gateway server.
 */
export async function startGateway(options: GatewayOptions = {}): Promise<{ close: () => Promise<void> }> {
  const { app, options: opts } = createGateway(options);
  const { serve } = await import("@hono/node-server");

  const server = serve({
    fetch: app.fetch,
    hostname: opts.host,
    port: opts.port,
  });

  console.error(`  ✓ Gateway läuft auf http://${opts.host}:${opts.port}`);
  console.error(`    GET  /health          – Gesundheitscheck`);
  console.error(`    GET  /ready           – Bereitschaft`);
  console.error(`    GET  /v1/models       – Modelle auflisten`);
  console.error(`    POST /v1/chat/completions – Chat-Completion`);
  console.error(`    POST /v1/responses    – Responses API`);

  return {
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
