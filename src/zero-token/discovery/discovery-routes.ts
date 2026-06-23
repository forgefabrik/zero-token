import { Hono } from "hono";
import {
  getDiscoveredModelCandidates,
  getDiscoverySnapshot,
  runProviderDiscovery,
} from "./discovery-service.js";
import {
  getProviderLoginJob,
  listProviderLoginJobs,
  startProviderLoginJob,
} from "../providers/provider-login-jobs.js";

export function createDiscoveryRoutes(): Hono {
  const routes = new Hono();

  routes.get("/", async (c) => c.json(await getDiscoverySnapshot()));

  routes.get("/models", async (c) => {
    const models = await getDiscoveredModelCandidates();
    return c.json({ count: models.length, models });
  });

  routes.post("/scan", async (c) => {
    const snapshot = await runProviderDiscovery();
    return c.json(snapshot);
  });

  routes.get("/logins", (c) => c.json({ jobs: listProviderLoginJobs() }));

  routes.get("/logins/:id", (c) => {
    const job = getProviderLoginJob(c.req.param("id"));
    return job ? c.json(job) : c.json({ error: "Login-Job nicht gefunden" }, 404);
  });

  routes.post("/logins", async (c) => {
    const body = await c.req.json<{ providerId?: string }>().catch(() => ({}));
    if (!body.providerId) return c.json({ error: "providerId ist erforderlich" }, 400);

    try {
      return c.json(startProviderLoginJob(body.providerId), 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Login konnte nicht gestartet werden" },
        400,
      );
    }
  });

  return routes;
}
