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
  getCandidateProbeJob,
  listCandidateProbeJobs,
  startCandidateProbeJob,
  stopCandidateProbeJob,
} from "./candidate-probe-runtime.js";
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

type DecisionBody = { decision?: CandidateDecision; note?: string };
type LoginBody = { providerId?: string };
type ProbeBody = { providerId?: string };

function remoteLoginSettings(): { cdpUrl: string; viewUrl: string } {
  const cdpUrl = process.env.NOVA_CDP_URL?.trim();
  const viewUrl = process.env.NOVA_REMOTE_LOGIN_VIEW_URL?.trim();
  if (!cdpUrl || !viewUrl) {
    throw new Error(
      "Server-Login nicht konfiguriert: NOVA_CDP_URL und NOVA_REMOTE_LOGIN_VIEW_URL fehlen.",
    );
  }
  const parsed = new URL(viewUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !local) {
    throw new Error("NOVA_REMOTE_LOGIN_VIEW_URL muss HTTPS verwenden.");
  }
  return { cdpUrl, viewUrl: parsed.toString() };
}

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
    const body = await c.req.json<Partial<DiscoveryControlConfig>>().catch(
      () => ({} as Partial<DiscoveryControlConfig>),
    );
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
    const body = await c.req.json<DecisionBody>().catch(() => ({} as DecisionBody));
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

  routes.get("/probes", (c) => c.json({ jobs: listCandidateProbeJobs() }));

  routes.get("/probes/:id", (c) => {
    const job = getCandidateProbeJob(c.req.param("id"));
    return job ? c.json(job) : c.json({ error: "Probe-Job nicht gefunden" }, 404);
  });

  routes.post("/probes", async (c) => {
    const body = await c.req.json<ProbeBody>().catch(() => ({} as ProbeBody));
    if (!body.providerId) return c.json({ error: "providerId ist erforderlich" }, 400);
    try {
      return c.json(await startCandidateProbeJob(body.providerId), 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Probe konnte nicht gestartet werden" },
        400,
      );
    }
  });

  routes.post("/probes/:id/stop", async (c) => {
    try {
      return c.json(await stopCandidateProbeJob(c.req.param("id")));
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Probe konnte nicht beendet werden" },
        404,
      );
    }
  });

  routes.get("/logins", (c) => {
    try {
      const { viewUrl } = remoteLoginSettings();
      return c.json({
        jobs: listProviderLoginJobs().map((job) => ({ ...job, viewUrl })),
        configured: true,
      });
    } catch (error) {
      return c.json({
        jobs: [],
        configured: false,
        error: error instanceof Error ? error.message : "Server-Login nicht konfiguriert",
      });
    }
  });

  routes.get("/logins/:id", (c) => {
    const job = getProviderLoginJob(c.req.param("id"));
    if (!job) return c.json({ error: "Login-Job nicht gefunden" }, 404);
    try {
      const { viewUrl } = remoteLoginSettings();
      return c.json({ ...job, viewUrl });
    } catch {
      return c.json(job);
    }
  });

  routes.post("/logins", async (c) => {
    const body = await c.req.json<LoginBody>().catch(() => ({} as LoginBody));
    if (!body.providerId) return c.json({ error: "providerId ist erforderlich" }, 400);

    try {
      const { cdpUrl, viewUrl } = remoteLoginSettings();
      const job = startProviderLoginJob(body.providerId, { cdpUrl });
      return c.json({ ...job, viewUrl }, 202);
    } catch (error) {
      return c.json(
        { error: error instanceof Error ? error.message : "Login konnte nicht gestartet werden" },
        400,
      );
    }
  });

  return routes;
}
