import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import type { ChatCompletionRequest } from "../inference/types.js";
import logger from "../logger.js";
import { createLogRoutes } from "../logging/log-routes.js";
import { createDiscoveryRoutes } from "../discovery/discovery-routes.js";
import { createBrowserBridgeRoutes } from "../providers/browser-bridge-routes.js";
import { resolveInferenceProvider } from "./inference-dispatch.js";
import { requireApiKey } from "./api-key-auth.js";

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

  app.use("/v1/*", requireApiKey());
  app.route("/api/logs", createLogRoutes());
  app.route("/api/discovery", createDiscoveryRoutes());
  app.route("/api/browser-bridge", createBrowserBridgeRoutes());

  app.get("/health", (c) => c.json({ status: "ok", timestamp: new Date().toISOString() }));

  app.get("/ready", async (c) => {
    const { getCachedModels } = await import("../models/model-cache.js");
    const models = await getCachedModels();
    const ready = models !== null && models.length > 0;
    return c.json({ ready, models: models?.length ?? 0, timestamp: new Date().toISOString() }, ready ? 200 : 503);
  });

  app.get("/v1/models", async (c) => {
    const { listModels } = await import("../models/model-service.js");
    const models = await listModels();
    return c.json({
      object: "list",
      data: models.map((model) => ({
        id: model.id,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: model.provider,
        capabilities: model.capabilities,
      })),
    });
  });

  app.post("/v1/chat/completions", async (c) => {
    try {
      const body: ChatCompletionRequest = await c.req.json();
      if (!body.model) return c.json({ error: { message: "model ist erforderlich" } }, 400);
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return c.json({ error: { message: "messages ist erforderlich" } }, 400);
      }

      const provider = await resolveInferenceProvider(body.model, body.accountId);
      if (body.stream) return handleStreamingResponse(provider, body);
      return c.json(await provider.chatCompletion(body));
    } catch (error) {
      return inferenceError(c, error);
    }
  });

  app.post("/v1/responses", async (c) => {
    try {
      const body: Record<string, unknown> = await c.req.json();
      if (typeof body.model !== "string" || !body.model.trim()) {
        return c.json({ error: { message: "model ist erforderlich" } }, 400);
      }

      const input = body.input ?? body.messages ?? [];
      const request: ChatCompletionRequest = {
        model: body.model,
        messages: Array.isArray(input)
          ? input.map((item: any) => ({ role: item.role ?? "user", content: item.content ?? "" }))
          : [{ role: "user", content: String(input) }],
        stream: body.stream as boolean | undefined,
        accountId: typeof body.accountId === "string" ? body.accountId : undefined,
      };
      const provider = await resolveInferenceProvider(request.model, request.accountId);
      if (request.stream) return handleStreamingResponse(provider, request);

      const response = await provider.chatCompletion(request);
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
    } catch (error) {
      return inferenceError(c, error);
    }
  });

  app.get("/api/accounts", async (c) => {
    const { listAccounts } = await import("../accounts/account-service.js");
    const accounts = await listAccounts();
    return c.json(accounts.map(maskAccount));
  });

  app.get("/api/accounts/:id", async (c) => {
    const { getAccount } = await import("../accounts/account-repository.js");
    const account = await getAccount(c.req.param("id"));
    return account ? c.json(maskAccount(account)) : c.json({ error: "Account nicht gefunden" }, 404);
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
    return account ? c.json(await validateAccountSession(account)) : c.json({ error: "Account nicht gefunden" }, 404);
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
    const models = await getCachedModels();
    const publicBase = (process.env.NOVA_PUBLIC_BASE_URL ?? "https://bkg.eysho.info").replace(/\/+$/, "");
    return c.json({
      accounts: accounts.length,
      validSessions: accounts.filter((account) => account.sessionStatus === "valid").length,
      models: models?.length ?? 0,
      apiBase: `${publicBase}/v1`,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/config", async (c) => {
    const { loadConfig } = await import("../config/config.js");
    const config = await loadConfig();
    return c.json(redactConfig(config));
  });

  serveConsole(app);
  return { app, options: opts };
}

function maskAccount(account: any) {
  const { cookies, accessToken, ...rest } = account;
  return { ...rest, cookiesPresent: Boolean(cookies), hasAccessToken: Boolean(accessToken) };
}

function redactConfig(config: any) {
  const safe = structuredClone(config);
  if (safe.proxy) {
    for (const scope of Object.values(safe.proxy) as any[]) {
      if (scope?.password) scope.password = "[REDACTED]";
    }
  }
  return safe;
}

function serveConsole(app: Hono) {
  const distPath = join(process.cwd(), "web-console", "dist");
  if (!existsSync(distPath)) {
    logger.warn("Nova Web-Konsole nicht gefunden (%s) – nur API-Modus", distPath);
    return;
  }

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
    const path = new URL(c.req.url).pathname;
    if (path.startsWith("/api/") || path.startsWith("/v1/") || path === "/health" || path === "/ready") {
      return c.notFound();
    }
    const filePath = join(distPath, path === "/" ? "index.html" : path);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      return c.newResponse(readFileSync(filePath), 200, {
        "Content-Type": mime[extname(filePath)] || "application/octet-stream",
      });
    }
    return c.html(readFileSync(join(distPath, "index.html"), "utf8"));
  });
  logger.info("Nova Web-Konsole wird statisch ausgeliefert: %s", distPath);
}

async function handleStreamingResponse(provider: any, request: ChatCompletionRequest): Promise<Response> {
  const { toSSEStream } = await import("../inference/stream.js");
  return new Response(toSSEStream(await provider.chatCompletionStream(request)), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function inferenceError(c: any, error: unknown) {
  logger.error({ error }, "Inference-Anfrage fehlgeschlagen");
  const status = error instanceof Error && "statusCode" in error
    ? Number((error as { statusCode?: number }).statusCode ?? 500)
    : 500;
  return c.json(
    { error: { message: error instanceof Error ? error.message : "Interner Fehler" } },
    status,
  );
}

export async function startGateway(options: GatewayOptions = {}): Promise<{ close: () => Promise<void> }> {
  const { app, options: opts } = createGateway(options);
  const { serve } = await import("@hono/node-server");
  const server = serve({ fetch: app.fetch, hostname: opts.host, port: opts.port });
  const publicBase = (process.env.NOVA_PUBLIC_BASE_URL ?? `http://${opts.host}:${opts.port}`).replace(/\/+$/, "");

  console.error(`  ✓ Gateway intern auf http://${opts.host}:${opts.port}`);
  console.error(`    GET  ${publicBase}/v1/models`);
  console.error(`    POST ${publicBase}/v1/chat/completions`);
  console.error(`    POST ${publicBase}/v1/responses`);
  console.error("    /v1 benötigt Authorization: Bearer <API_KEY>");

  return {
    close: async () => {
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
}
