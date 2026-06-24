import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { novaHome } from "../config/paths.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import { getProviderBrowserPage } from "../providers/remote-browser-session.js";
import logger from "../logger.js";

export interface GoogleIdentity {
  id: string;
  type: "google";
  label: string;
  email?: string;
  status: "connected" | "login-required" | "error";
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  error?: string;
}

export interface GoogleLoginJob {
  id: string;
  status: "starting" | "waiting-for-user" | "succeeded" | "failed";
  viewUrl: string;
  createdAt: string;
  updatedAt: string;
  identityId?: string;
  message?: string;
}

const jobs = new Map<string, GoogleLoginJob>();
const filePath = () => join(novaHome(), "google-identities.json");

async function load(): Promise<GoogleIdentity[]> {
  return (await readStored<GoogleIdentity[]>(filePath())) ?? [];
}

async function save(items: GoogleIdentity[]): Promise<void> {
  await writeStored(filePath(), items);
}

export async function listGoogleIdentities(): Promise<GoogleIdentity[]> {
  return (await load()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listGoogleLoginJobs(): GoogleLoginJob[] {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getGoogleLoginJob(id: string): GoogleLoginJob | undefined {
  const job = jobs.get(id);
  return job ? { ...job } : undefined;
}

export function startGoogleLogin(): GoogleLoginJob {
  const active = [...jobs.values()].find(
    (job) => job.status === "starting" || job.status === "waiting-for-user",
  );
  if (active) return { ...active };

  const now = new Date().toISOString();
  const job: GoogleLoginJob = {
    id: randomUUID(),
    status: "starting",
    viewUrl:
      process.env.NOVA_REMOTE_LOGIN_VIEW_URL?.trim() ||
      "https://bkg.eysho.info/remote-browser/vnc.html",
    createdAt: now,
    updatedAt: now,
    message: "Google-Anmeldung wird sichtbar im Remote-Browser geöffnet.",
  };
  jobs.set(job.id, job);
  void execute(job.id);
  return { ...job };
}

async function execute(jobId: string): Promise<void> {
  const update = (patch: Partial<GoogleLoginJob>) => {
    const current = jobs.get(jobId);
    if (!current) return;
    jobs.set(jobId, { ...current, ...patch, updatedAt: new Date().toISOString() });
  };

  try {
    const page = await getProviderBrowserPage("https://accounts.google.com/");
    await page.goto("https://accounts.google.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    update({
      status: "waiting-for-user",
      message: "Melde dich bei Google an. Zustimmung und Captchas bleiben manuell.",
    });

    const deadline = Date.now() + 5 * 60_000;
    while (Date.now() < deadline) {
      if (new URL(page.url()).hostname === "myaccount.google.com") {
        const email = await detectEmail(page);
        const identities = await load();
        const now = new Date().toISOString();
        const existing = email
          ? identities.find((item) => item.email?.toLowerCase() === email.toLowerCase())
          : undefined;
        const identity: GoogleIdentity = existing
          ? {
              ...existing,
              label: email ?? existing.label,
              email: email ?? existing.email,
              status: "connected",
              updatedAt: now,
              lastValidatedAt: now,
              error: undefined,
            }
          : {
              id: randomUUID(),
              type: "google",
              label: email ?? "Google-Sitzung",
              email,
              status: "connected",
              createdAt: now,
              updatedAt: now,
              lastValidatedAt: now,
            };
        await save(
          existing
            ? identities.map((item) => (item.id === identity.id ? identity : item))
            : [...identities, identity],
        );
        update({
          status: "succeeded",
          identityId: identity.id,
          message: "Google-Sitzung ist im Browserprofil verbunden.",
        });
        return;
      }
      await page.waitForTimeout(1_000);
    }

    update({ status: "failed", message: "Google-Anmeldung wurde nicht abgeschlossen." });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    update({ status: "failed", message });
    logger.error({ error: message }, "Google-Identität konnte nicht verbunden werden");
  }
}

async function detectEmail(page: Awaited<ReturnType<typeof getProviderBrowserPage>>): Promise<string | undefined> {
  try {
    return await page.evaluate(() => {
      const text = document.body.innerText;
      return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    });
  } catch {
    return undefined;
  }
}

export async function validateGoogleIdentity(id: string): Promise<GoogleIdentity | null> {
  const identities = await load();
  const identity = identities.find((item) => item.id === id);
  if (!identity) return null;

  try {
    const page = await getProviderBrowserPage("https://myaccount.google.com/");
    await page.goto("https://myaccount.google.com/", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const connected = new URL(page.url()).hostname === "myaccount.google.com";
    const now = new Date().toISOString();
    const updated: GoogleIdentity = {
      ...identity,
      status: connected ? "connected" : "login-required",
      updatedAt: now,
      lastValidatedAt: now,
      error: connected ? undefined : "Google-Anmeldung ist nicht mehr aktiv.",
    };
    await save(identities.map((item) => (item.id === id ? updated : item)));
    return updated;
  } catch (error) {
    const updated: GoogleIdentity = {
      ...identity,
      status: "error",
      updatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    await save(identities.map((item) => (item.id === id ? updated : item)));
    return updated;
  }
}

export async function removeGoogleIdentity(id: string): Promise<boolean> {
  const identities = await load();
  const next = identities.filter((item) => item.id !== id);
  if (next.length === identities.length) return false;
  await save(next);
  return true;
}
