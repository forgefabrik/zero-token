import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createAccount, updateAccount } from "../accounts/account-service.js";
import { validateAccountSession } from "../session/session-service.js";
import { resolveProvider } from "./registry.js";

export type BrowserBridgeStatus =
  | "waiting-for-login"
  | "capturing"
  | "validating"
  | "succeeded"
  | "failed"
  | "expired";

export interface BrowserBridgeJob {
  id: string;
  providerId: string;
  providerLabel: string;
  loginUrl: string;
  status: BrowserBridgeStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  accountId?: string;
  accountLabel?: string;
  error?: string;
}

export interface BrowserBridgeSession {
  cookies: string;
  accessToken?: string;
  userAgent?: string;
}

interface StoredJob extends BrowserBridgeJob {
  tokenHash: string;
}

const jobs = new Map<string, StoredJob>();
const JOB_TTL_MS = 10 * 60_000;
const MAX_JOBS = 50;
const MAX_COOKIES = 128_000;
const MAX_TOKEN = 32_000;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function publicJob(job: StoredJob): BrowserBridgeJob {
  const { tokenHash: _tokenHash, ...safe } = job;
  return safe;
}

function tokenMatches(job: StoredJob, token: string): boolean {
  const expected = Buffer.from(job.tokenHash, "hex");
  const actual = Buffer.from(hash(token), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function expireJobs(): void {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (new Date(job.expiresAt).getTime() <= now && !["succeeded", "failed"].includes(job.status)) {
      job.status = "expired";
      job.message = "Login-Fenster ist abgelaufen. Starte den Login erneut.";
      job.updatedAt = new Date().toISOString();
    }
  }
  if (jobs.size <= MAX_JOBS) return;
  const removable = [...jobs.values()]
    .filter((job) => ["succeeded", "failed", "expired"].includes(job.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const job of removable.slice(0, jobs.size - MAX_JOBS)) jobs.delete(job.id);
}

export function createBrowserBridgeJob(providerId: string): BrowserBridgeJob & { token: string } {
  expireJobs();
  const provider = resolveProvider(providerId);
  if (!provider) throw new Error(`Unbekannter Provider: ${providerId}`);
  if (provider.authType !== "web-login") throw new Error("Dieser Provider verwendet keinen Browser-Login.");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const job: StoredJob = {
    id: randomUUID(),
    providerId: provider.id,
    providerLabel: provider.label,
    loginUrl: provider.loginUrl,
    status: "waiting-for-login",
    message: "Login-Seite wurde in deinem Browser geöffnet. Melde dich dort an und übernimm danach die Sitzung.",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + JOB_TTL_MS).toISOString(),
    tokenHash: hash(token),
  };
  jobs.set(job.id, job);
  return { ...publicJob(job), token };
}

export function getBrowserBridgeJob(id: string, token: string): BrowserBridgeJob | undefined {
  expireJobs();
  const job = jobs.get(id);
  if (!job || !tokenMatches(job, token)) return undefined;
  return publicJob(job);
}

export async function completeBrowserBridgeJob(
  id: string,
  token: string,
  session: BrowserBridgeSession,
): Promise<BrowserBridgeJob> {
  expireJobs();
  const job = jobs.get(id);
  if (!job || !tokenMatches(job, token)) throw new Error("Ungültiger oder abgelaufener Login-Job.");
  if (job.status === "expired") throw new Error("Login-Job ist abgelaufen.");
  if (!session.cookies?.trim()) throw new Error("Die Browser Bridge hat keine Sitzungscookies geliefert.");
  if (session.cookies.length > MAX_COOKIES) throw new Error("Sitzungscookies sind zu groß.");
  if ((session.accessToken?.length ?? 0) > MAX_TOKEN) throw new Error("Zugriffstoken ist zu groß.");

  job.status = "capturing";
  job.message = "Sitzung wurde übernommen und wird lokal gespeichert …";
  job.updatedAt = new Date().toISOString();

  try {
    const provider = resolveProvider(job.providerId);
    if (!provider) throw new Error("Provider ist nicht mehr registriert.");
    const account = await createAccount(provider.label, provider.implementation);
    const stored = await updateAccount(account.id, {
      cookies: session.cookies,
      accessToken: session.accessToken,
      userAgent: session.userAgent,
      sessionStatus: "unknown",
    });

    job.status = "validating";
    job.message = "Sitzung wird beim Provider geprüft …";
    job.updatedAt = new Date().toISOString();
    const validation = await validateAccountSession(stored);

    job.status = validation.valid ? "succeeded" : "failed";
    job.accountId = account.id;
    job.accountLabel = provider.label;
    job.message = validation.valid
      ? "Account wurde verbunden und lokal gespeichert."
      : "Sitzung wurde gespeichert, konnte aber nicht bestätigt werden.";
    job.error = validation.valid ? undefined : validation.error;
    job.updatedAt = new Date().toISOString();
    return publicJob(job);
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = "Sitzung konnte nicht gespeichert werden.";
    job.updatedAt = new Date().toISOString();
    return publicJob(job);
  }
}
