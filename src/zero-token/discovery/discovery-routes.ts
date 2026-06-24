import { Hono } from "hono";
import type { CandidateDecision, DiscoveryControlConfig } from "./control-types.js";
import {
  configureDiscoveryControl,
  decideDiscoveryCandidate,
  getDiscoveryControlState,
  runControlledDiscovery,
  startDiscoveryControl,
} from "./control-service.js";
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

const DECISIONS: CandidateDecision[] = [
  "new",
  "account-required",
  "approved",
  "account-ready",
  "rejected",
];

export function createDiscoveryRoutes(): Hono {
  const routes = new Hono();
  void startDiscoveryControl();

  routes.get("/", async (c) => c.json(await getDiscoverySnapshot()));

  routes.get("/models", async (c) => {
    const models = await getDiscoveredModelCandidates();
    return c.json({ count: models.length, models });
  });

  routes.post("/scan", async (c) => {
    const snapshot = await runProviderDiscovery();
    return c.json(snapshot);
  });

  routes.get("/control", async (c) => c.json(await getDiscoveryControlState()));

  routes.put("/control/config", async (c) => {
    const body = await c.req.json<Partial<DiscoveryControlConfig>>().catch(() => ({}));
    try {
      return c.json(await configureDiscoveryControl(body));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Konfiguration ist ungültig" },
        400,
      );
    }
  });

  routes.post("/control/run", async (c) => {
    return c.json(await runControlledDiscovery());
  });

  routes.post("/control/candidates/:id/decision", async (c) => {
    const body = await c.req
      .json<{ decision?: CandidateDecision; note?: string }>()
      .catch(() => ({}));
    if (!body.decision || !DECISIONS.includes(body.decision)) {
      return c.json({ error: "Ungültige Kandidatenentscheidung" }, 400);
    }

    try {
      return c.json(
        await decideDiscoveryCandidate(c.req.param("id"), body.decision, body.note),
      );
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Kandidat nicht gefunden" },
        404,
      );
    }
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
