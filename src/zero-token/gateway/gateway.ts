import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { ChatCompletionRequest } from "../inference/types.js";
import logger from "../logger.js";
import { createLogRoutes } from "../logging/log-routes.js";
import { createDiscoveryRoutes } from "../discovery/discovery-routes.js";
import { createBrowserBridgeRoutes } from "../providers/browser-bridge-routes.js";

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

export function createGateway(options: GatewayOptions = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const app = new Hono();

  if (opts.cors) {
    app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"] }));
  }

  app.route("/api/logs", createLogRoutes());
  app.route("/api/discovery", createDiscoveryRoutes());
  app.route("/api/browser-bridge", createBrowserBridgeRoutes());

  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

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

  app.post("/v1/chat/completions", async (c) => {
    try {
      const body: ChatCompletionRequest = await c.req.json();
      if (!body.model) {
        return c.json({ error: { message: "model ist erforderlich" } }, 400);
      }
      if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
        return c.json({ error: { message: "messages ist erforderlich" } }, 400);
      }

      const provider = new (await import("../inference/chatgpt-provider.js")).ChatGPTProvider(body.accountId);
      if (body.stream) return handleStreamingResponse(c, provider, body);
      return c.json(await provider.chatCompletion(body));
    } catch (err) {
      logger.error({ err }, "Fehler bei /v1/chat/completions");
      const status = err instanceof Error && "statusCode" in err ? (err as any).statusCode : 500;
      return c.json(
        { error: { message: err instanceof Error ? err.message : "Interner Fehler" } },
        status,
      );
    }
  });

  app.post("/v1/responses", async (c) => {
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
      if (chatRequest.stream) return handleStreamingResponse(c, provider, chatRequest);

      const response = await provider.chatCompletion(chatRequest);
      return c.json({
        id: response.id,
        object: "response",
        created: response.created,
        model: response.model,
        output: response.choices.map((choice) => ({
          role: choice.message.role,
          content: choice.message.content,
        })),
        usage: response.usage,
      });
    } catch (err) {
      logger.error({ err }, "Fehler bei /v1/responses");
      const status = err instanceof Error && "statusCode" in err ? (err as any).statusCode : 500;
      return c.json(
        { error: { message: err instanceof Error ? err.message : "Interner Fehler" } },
        status,
      );
    }
  });

  app.get("/api/accounts", async (c) => {
    const { listAccounts } = await import("../accounts/account-service.js");
    const accounts = await listAccounts();
    const masked = accounts.map((account) => {
      const { cookies, accessToken, ...rest } = account;
      return {
        ...rest,
        cookiesPresent: Boolean(cookies),
        hasAccessToken: Boolean(accessToken),
      };
    });
    return c.json(masked);
  });

  app.get("/api/accounts/:id", async (c) => {
    const { getAccount } = await import("../accounts/account-repository.js");
    const account = await getAccount(c.req.param("id"));
    if (!account) return c.json({ error: "Account nicht gefunden" }, 404);
    const { cookies, accessToken, ...rest } = account;
    return c.json({
      ...rest,
      cookiesPresent: Boolean(cookies),
      hasAccessToken: Boolean(accessToken),
    });
  });

  app.delete("/api/accounts/:id", async (c) => {
    const { getAccount } = await import("../accounts/account-repository.js");
    const { deleteAccount } = await import("../accounts/account-service.js");
    const id = c.req.param("id");
    if (!(await getAccount(id))) return c.json({ error: "Account nicht gefunden" }, 404);
    await deleteAccount(id);
    return c.json({ success: true, id });
  });

  app.post("/api/accounts/:id/validate", async (c) => {
    const { getAccount } = await import("../accounts/account-repository.js");
    const { validateAccountSession } = await import("../session/session-service.js");
    const account = await getAccount(c.req.param("id"));
    if (!account) return c.json({ error: "Account nicht gefunden" }, 404);
    return c.json(await validateAccountSession(account));
  });

  app.get("/api/models", async (c) => {
    const { getCachedModels } = await import("../models/model-cache.js");
    return c.json((await getCachedModels()) ?? []);
  });

  app.post("/api/models/refresh", async (c) => {
    const { refreshModels } = await import("../models/model-service.js");
    const models = await refreshModels();
    return c.json({ count: models.length, models });
  });

  app.get("/api/status", async (c) => {
    const { getCachedModels } = await import("../models/model-cache.js");
    const { listAccounts } = await import("../accounts/account-service.js");
    const accounts = await listAccounts();
    const cached = await getCachedModels();
    return c.json({
      accounts: accounts.length,
      validSessions: accounts.filter((account) => account.sessionStatus === "valid").length,
      models: cached?.length ?? 0,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/config", async (c) => {
    const { loadConfig } = await import("../config/config.js");
    const config = await loadConfig();
    const safe = { ...config };
    if (safe.proxy) {
      for (const key of Object.keys(safe.proxy)) {
        const scope = safe.proxy[key as keyof typeof safe.proxy];
        if (scope?.password) {
          safe.proxy[key as keyof typeof safe.proxy] = {
            ...scope,
            password: "[REDACTED]",
          };
        }
      }
    }
    return c.json(safe);
  });

  const distPath = join(process.cwd(), "web-console", "dist");
  if (existsSync(distPath)) {
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
      ".json": "application/json",
    };

    app.all("*", async (c) => {
      const url = new URL(c.req.url);
      const path = url.pathname;
      if (path.startsWith("/api/") || path.startsWith("/v1/") || path === "/health" || path === "/ready") {
        return c.notFound();
      }

      const filePath = join(distPath, path === "/" ? "index.html" : path);
      if (existsSync(filePath) && statSync(filePath).isFile()) {
        const contentType = mime[extname(filePath)] || "application/octet-stream";
        return c.newResponse(readFileSync(filePath), 200, { "Content-Type": contentType });
      }

      return c.html(readFileSync(join(distPath, "index.html"), "utf8"));
    });
    logger.info("Nova Web-Konsole wird statisch ausgeliefert: %s", distPath);
  } else {
    logger.warn("Nova Web-Konsole nicht gefunden (%s) – nur API-Modus", distPath);
  }

  return { app, options: opts };
}

async function handleStreamingResponse(
  c: any,
  provider: any,
  request: ChatCompletionRequest,
): Promise<Response> {
  const stream = await provider.chatCompletionStream(request);
  const { toSSEStream } = await import("../inference/stream.js");
  return new Response(toSSEStream(stream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function startGateway(options: GatewayOptions = {}): Promise<{ close: () => Promise<void> }> {
  const { app, options: opts } = createGateway(options);
  const { serve } = await import("@hono/node-server");
  const server = serve({ fetch: app.fetch, hostname: opts.host, port: opts.port });

  console.error(`  ✓ Gateway läuft auf http://${opts.host}:${opts.port}`);
  console.error("    GET  /health              – Gesundheitscheck");
  console.error("    GET  /ready               – Bereitschaft");
  console.error("    GET  /v1/models           – Modelle auflisten");
  console.error("    POST /v1/chat/completions – Chat-Completion");
  console.error("    POST /v1/responses        – Responses API");
  console.error("    GET  /api/logs/stream     – Redigierte Live-Logs");
  console.error("    POST /api/discovery/scan  – Provider-Katalog synchronisieren");

  return {
    close: async () => {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
