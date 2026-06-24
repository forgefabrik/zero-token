import { Hono } from "hono";
import {
  createGateway as createRuntimeGateway,
  type GatewayOptions,
} from "./runtime-gateway.js";
import { createPlaygroundRoutes } from "./playground-routes.js";
import { apiRequestLogger } from "./api-request-logger.js";

export type { GatewayOptions } from "./runtime-gateway.js";

export function createGateway(options: GatewayOptions = {}) {
  const outer = new Hono();
  outer.use("*", apiRequestLogger());
  outer.route("/api/playground", createPlaygroundRoutes());

  const runtime = createRuntimeGateway(options);
  outer.route("/", runtime.app);
  return { app: outer, options: runtime.options };
}

export async function startGateway(
  options: GatewayOptions = {},
): Promise<{ close: () => Promise<void> }> {
  const { app, options: resolved } = createGateway(options);
  const { serve } = await import("@hono/node-server");
  const server = serve({
    fetch: app.fetch,
    hostname: resolved.host,
    port: resolved.port,
  });
  const publicBase = (
    process.env.NOVA_PUBLIC_BASE_URL ?? `http://${resolved.host}:${resolved.port}`
  ).replace(/\/+$/, "");

  console.error(`  ✓ Gateway intern auf http://${resolved.host}:${resolved.port}`);
  console.error(`    GET  ${publicBase}/v1/models`);
  console.error(`    POST ${publicBase}/v1/chat/completions`);
  console.error(`    POST ${publicBase}/v1/responses`);
  console.error("    Dashboard-Playground: /api/playground/chat");

  return {
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
