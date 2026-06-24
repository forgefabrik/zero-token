import { randomUUID } from "node:crypto";
import { chromium, type Browser } from "playwright";
import logger from "../logger.js";
import { getDiscoverySnapshot } from "./discovery-service.js";
import { getCandidateProbeCapability } from "./candidate-probe-capability.js";
import { sanitizeProbeUrl } from "./candidate-probe-evidence.js";
import { attachCandidateProbeObserver } from "./candidate-probe-observer.js";
import {
  cloneProbeJob,
  finishStoredProbeJob,
  getStoredProbeJob,
  listStoredProbeJobs,
  putProbeJob,
  updateProbeJob,
} from "./candidate-probe-store.js";
import type { CandidateProbeJob, CandidateProbeStatus } from "./candidate-probe-types.js";
import { inspectPublicSite, validatePublicSiteUrl } from "./public-site-inspector.js";

interface Runtime {
  browser: Browser;
  timer: NodeJS.Timeout;
}

const runtimes = new Map<string, Runtime>();
const launchUrls = new Map<string, string>();
const PROBE_TIMEOUT_MS = 10 * 60_000;

async function finish(
  id: string,
  status: CandidateProbeStatus,
  message: string,
  error?: string,
  closeBrowser = true,
): Promise<void> {
  const runtime = runtimes.get(id);
  runtimes.delete(id);
  launchUrls.delete(id);
  if (runtime) clearTimeout(runtime.timer);
  if (getStoredProbeJob(id)) finishStoredProbeJob(id, status, message, error);
  if (closeBrowser && runtime?.browser.isConnected()) {
    await runtime.browser.close().catch(() => undefined);
  }
}

async function runProbe(id: string): Promise<void> {
  const job = getStoredProbeJob(id);
  if (!job) return;

  const launchUrl = launchUrls.get(id) ?? job.homepage;
  let browser: Browser | undefined;
  try {
    await inspectPublicSite(launchUrl);
    browser = await chromium.launch({ headless: false });
    const timer = setTimeout(() => {
      void finish(id, "completed", "Probe-Zeit beendet. Technische Metadaten wurden gespeichert.");
    }, PROBE_TIMEOUT_MS);
    timer.unref?.();
    runtimes.set(id, { browser, timer });

    browser.once("disconnected", () => {
      if (runtimes.has(id)) {
        void finish(
          id,
          "completed",
          "Browser wurde geschlossen. Probe ist abgeschlossen.",
          undefined,
          false,
        );
      }
    });

    const context = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    const page = await context.newPage();
    attachCandidateProbeObserver(page, id);

    page.once("close", () => {
      if (runtimes.has(id)) {
        void finish(id, "completed", "Browser-Tab wurde geschlossen. Probe ist abgeschlossen.");
      }
    });

    await page.goto(launchUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    updateProbeJob(id, {
      status: "waiting-for-user",
      message:
        "Sende eine Testnachricht und schließe danach den Tab. Nova speichert keine Inhalte, Cookies oder Tokens.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ providerId: job.providerId, error: message }, "Kandidaten-Probe fehlgeschlagen");
    if (browser && !runtimes.has(id)) await browser.close().catch(() => undefined);
    await finish(id, "failed", "Probe konnte nicht gestartet werden.", message);
  }
}

export function listCandidateProbeJobs(): CandidateProbeJob[] {
  return listStoredProbeJobs();
}

export function getCandidateProbeJob(id: string): CandidateProbeJob | undefined {
  return getStoredProbeJob(id);
}

export async function startCandidateProbeJob(providerId: string): Promise<CandidateProbeJob> {
  const capability = getCandidateProbeCapability();
  if (!capability.available) {
    throw new Error("Lokales Chromium fehlt. Führe im Nova-Projekt 'npx playwright install chromium' aus.");
  }

  const active = listStoredProbeJobs().find(
    (job) => job.providerId === providerId && ["starting", "waiting-for-user"].includes(job.status),
  );
  if (active) return active;

  const snapshot = await getDiscoverySnapshot();
  const provider = snapshot.providers.find(
    (item) => item.id === providerId && item.status === "candidate",
  );
  if (!provider?.homepage) throw new Error("Kandidat besitzt keine öffentliche Homepage.");

  const validated = await validatePublicSiteUrl(provider.homepage);
  const now = new Date().toISOString();
  const job: CandidateProbeJob = {
    id: randomUUID(),
    providerId: provider.id,
    providerLabel: provider.label,
    homepage: sanitizeProbeUrl(validated.toString()),
    status: "starting",
    message: "Öffentliche Website wird geprüft und Browser wird gestartet …",
    createdAt: now,
    updatedAt: now,
    requestCount: 0,
    streamObserved: false,
    apiObserved: false,
    evidence: [],
  };
  launchUrls.set(job.id, validated.toString());
  putProbeJob(job);
  void runProbe(job.id);
  return cloneProbeJob(job);
}

export async function stopCandidateProbeJob(id: string): Promise<CandidateProbeJob> {
  const job = getStoredProbeJob(id);
  if (!job) throw new Error("Probe-Job nicht gefunden.");
  if (!runtimes.has(id)) return job;
  await finish(id, "cancelled", "Probe wurde manuell beendet.");
  return getStoredProbeJob(id)!;
}
