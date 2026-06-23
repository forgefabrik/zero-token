import { Hono } from "hono";
import {
  getProviderLoginJob,
  listProviderLoginJobs,
  startProviderLoginJob,
} from "./provider-login-jobs.js";

export function createProviderLoginRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", (c) => c.json({ jobs: listProviderLoginJobs() }));

  routes.get("/:id", (c) => {
    const job = getProviderLoginJob(c.req.param("id"));
    return job ? c.json(job) : c.json({ error: "Nicht gefunden" }, 404);
  });

  routes.post("/", async (c) => {
    const body = await c.req.json<{ providerId?: string }>().catch(() => ({}));
    if (!body.providerId) return c.json({ error: "providerId fehlt" }, 400);

    try {
      return c.json(startProviderLoginJob(body.providerId), 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Start fehlgeschlagen" },
        400,
      );
    }
  });

  return routes;
}
