import { Hono } from "hono";
import {
  getDiscoveredModelCandidates,
  getDiscoverySnapshot,
  runProviderDiscovery,
} from "./discovery-service.js";

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

  return routes;
}
