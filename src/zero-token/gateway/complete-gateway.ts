import { Hono } from "hono";
import {
  createGateway as createDashboardGateway,
  type GatewayOptions,
} from "./dashboard-gateway.js";
import { createProviderRuntimeRoutes } from "./provider-runtime-routes.js";

export type { GatewayOptions } from "./dashboard-gateway.js";

export function createGateway(options: GatewayOptions = {}) {
  const outer = new Hono();
  outer.route("/api/provider-runtime", createProviderRuntimeRoutes());
  const inner = createDashboardGateway(options);
  outer.route("/", inner.app);
  return { app: outer, options: inner.options };
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
  return {
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
