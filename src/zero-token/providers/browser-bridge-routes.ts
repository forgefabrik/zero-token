import { Hono } from "hono";
import {
  completeBrowserBridgeJob,
  createBrowserBridgeJob,
  getBrowserBridgeJob,
  type BrowserBridgeSession,
} from "./browser-bridge-jobs.js";

function bearerToken(value?: string): string {
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice(7).trim();
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function trustedWebOrigin(
  requestUrl: string,
  originHeader: string | undefined,
  hostHeader: string | undefined,
  forwardedProto?: string,
): boolean {
  if (!originHeader || !hostHeader) return false;
  try {
    const origin = new URL(originHeader);
    const request = new URL(requestUrl);
    const expectedHost = hostHeader.split(",", 1)[0].trim();
    const protocol = forwardedProto?.split(",", 1)[0].trim() || request.protocol.replace(":", "");
    if (origin.host !== expectedHost) return false;
    return protocol === "https" || isLoopback(origin.hostname);
  } catch {
    return false;
  }
}

export function createBrowserBridgeRoutes(): Hono {
  const routes = new Hono();

  routes.post("/jobs", async (c) => {
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (
      !trustedWebOrigin(
        c.req.url,
        c.req.header("origin"),
        host,
        c.req.header("x-forwarded-proto"),
      )
    ) {
      return c.json(
        { error: "Browser-Bridge-Login benötigt dieselbe sichere Web-Origin (HTTPS; lokal auch HTTP)." },
        403,
      );
    }

    const body = await c.req
      .json<{ providerId?: string }>()
      .catch(() => ({} as { providerId?: string }));
    if (!body.providerId) return c.json({ error: "providerId ist erforderlich" }, 400);
    try {
      return c.json(createBrowserBridgeJob(body.providerId), 201);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Loginjob konnte nicht erstellt werden" },
        400,
      );
    }
  });

  routes.get("/jobs/:id", (c) => {
    const token = bearerToken(c.req.header("authorization"));
    const job = getBrowserBridgeJob(c.req.param("id"), token);
    return job ? c.json(job) : c.json({ error: "Loginjob nicht gefunden oder abgelaufen" }, 404);
  });

  routes.post("/jobs/:id/complete", async (c) => {
    const host = c.req.header("x-forwarded-host") ?? c.req.header("host");
    if (
      !trustedWebOrigin(
        c.req.url,
        c.req.header("origin"),
        host,
        c.req.header("x-forwarded-proto"),
      )
    ) {
      return c.json({ error: "Unsichere Browser-Bridge-Origin" }, 403);
    }

    const token = bearerToken(c.req.header("authorization"));
    const body = await c.req
      .json<{ session?: BrowserBridgeSession }>()
      .catch(() => ({} as { session?: BrowserBridgeSession }));
    if (!body.session) return c.json({ error: "session ist erforderlich" }, 400);

    try {
      return c.json(await completeBrowserBridgeJob(c.req.param("id"), token, body.session));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Sitzung konnte nicht übernommen werden" },
        400,
      );
    }
  });

  return routes;
}
