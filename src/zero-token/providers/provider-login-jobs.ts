import { randomUUID } from "node:crypto";
import type { ProviderType } from "../accounts/account-types.js";
import type { ProviderBrowserConfig, ProviderLoginFailureReason } from "./provider-types.js";
import { resolveProvider, login as providerLogin } from "./registry.js";
import { createAccount, updateAccount } from "../accounts/account-service.js";
import logger from "../logger.js";

export type ProviderLoginJobStatus =
  | "starting"
  | "waiting-for-user"
  | "saving"
  | "succeeded"
  | "failed";

export interface ProviderLoginJob {
  id: string;
  providerId: string;
  providerLabel: string;
  loginUrl: string;
  status: ProviderLoginJobStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  accountId?: string;
  accountLabel?: string;
  failureReason?: ProviderLoginFailureReason;
  message?: string;
}

const jobs = new Map<string, ProviderLoginJob>();
const MAX_JOBS = 50;

function publicJob(job: ProviderLoginJob): ProviderLoginJob {
  return { ...job };
}

function updateJob(id: string, patch: Partial<ProviderLoginJob>): ProviderLoginJob {
  const current = jobs.get(id);
  if (!current) throw new Error(`Login-Job nicht gefunden: ${id}`);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

function trimJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const removable = [...jobs.values()]
    .filter((job) => job.status === "succeeded" || job.status === "failed")
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const job of removable.slice(0, jobs.size - MAX_JOBS)) jobs.delete(job.id);
}

export function listProviderLoginJobs(): ProviderLoginJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(publicJob);
}

export function getProviderLoginJob(id: string): ProviderLoginJob | undefined {
  const job = jobs.get(id);
  return job ? publicJob(job) : undefined;
}

export function removeProviderLoginJob(id: string): boolean {
  const job = jobs.get(id);
  if (
    !job ||
    job.status === "starting" ||
    job.status === "waiting-for-user" ||
    job.status === "saving"
  ) {
    return false;
  }
  return jobs.delete(id);
}

export function startProviderLoginJob(
  providerId: string,
  config: ProviderBrowserConfig = {},
): ProviderLoginJob {
  const provider = resolveProvider(providerId);
  if (!provider) throw new Error(`Unbekannter Provider: ${providerId}`);
  if (provider.authType !== "web-login") {
    throw new Error(`${provider.label} benötigt eine API-Konfiguration statt Browser-Login.`);
  }

  const now = new Date().toISOString();
  const job: ProviderLoginJob = {
    id: randomUUID(),
    providerId: provider.id,
    providerLabel: provider.label,
    loginUrl: provider.loginUrl,
    status: "starting",
    createdAt: now,
    updatedAt: now,
    message: "Lokaler Browser wird geöffnet …",
  };
  jobs.set(job.id, job);
  trimJobs();
  void executeLogin(job.id, provider.implementation, config);
  return publicJob(job);
}

async function executeLogin(
  jobId: string,
  providerType: ProviderType,
  config: ProviderBrowserConfig,
): Promise<void> {
  try {
    updateJob(jobId, {
      status: "waiting-for-user",
      message: "Bitte Anmeldung im geöffneten Browser abschließen.",
    });

    const result = await providerLogin(providerType, {
      ...config,
      headless: false,
    });
    if (!result.ok) {
      updateJob(jobId, {
        status: "failed",
        failureReason: result.reason,
        message: failureMessage(result.reason),
        completedAt: new Date().toISOString(),
      });
      return;
    }

    updateJob(jobId, {
      status: "saving",
      message: "Session wird lokal gespeichert …",
    });
    const descriptor = resolveProvider(providerType);
    const accountLabel =
      result.info.name?.trim() ||
      result.info.email?.split("@")[0] ||
      descriptor?.label ||
      providerType;
    const account = await createAccount(accountLabel, providerType);
    await updateAccount(account.id, {
      email: result.info.email,
      userId: result.info.userId,
      plan: result.info.plan,
      cookies: result.session.cookies,
      accessToken: result.session.accessToken,
      userAgent: result.session.userAgent,
      sessionStatus: "valid",
      lastValidatedAt: new Date().toISOString(),
    });

    updateJob(jobId, {
      status: "succeeded",
      accountId: account.id,
      accountLabel,
      message: "Account wurde sicher lokal gespeichert.",
      completedAt: new Date().toISOString(),
    });
    logger.info(
      { provider: providerType, accountId: account.id },
      "Web-UX-Login abgeschlossen",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    updateJob(jobId, {
      status: "failed",
      failureReason: "unknown-error",
      message,
      completedAt: new Date().toISOString(),
    });
    logger.error(
      { provider: providerType, error: message },
      "Web-UX-Login fehlgeschlagen",
    );
  }
}

function failureMessage(reason: ProviderLoginFailureReason): string {
  switch (reason) {
    case "browser-launch-failed":
      return "Lokaler Browser konnte nicht geöffnet werden.";
    case "login-timeout":
      return "Anmeldung wurde nicht rechtzeitig abgeschlossen.";
    case "plan-not-supported":
      return "Der erkannte Account-Plan wird nicht unterstützt.";
    case "session-extraction-failed":
      return "Die lokale Sitzung konnte nicht ausgelesen werden.";
    case "user-cancelled":
      return "Anmeldung wurde abgebrochen.";
    case "configuration-required":
      return "Provider benötigt zusätzliche Konfiguration.";
    case "unknown-provider":
      return "Provider ist nicht registriert.";
    default:
      return "Anmeldung ist fehlgeschlagen.";
  }
}
