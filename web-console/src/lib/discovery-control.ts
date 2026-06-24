export interface DiscoveryControlState {
  config: {
    enabled: boolean;
    runOnStart: boolean;
    intervalMinutes: number;
    minScore: number;
    inspectHomepages: boolean;
    notifyOnAccountRequired: boolean;
    sources: string[];
  };
  reviews: Array<{
    providerId: string;
    label: string;
    homepage?: string;
    score: number;
    valuable: boolean;
    accountRequired: boolean;
    homepageReachable: boolean;
    streamPotential: boolean;
    apiPotential: boolean;
    decision: string;
    models: string[];
    reasons: string[];
    lastCheckedAt: string;
  }>;
  running: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
}

export interface CandidateProbeJob {
  id: string;
  providerId: string;
  providerLabel: string;
  homepage: string;
  status: "starting" | "waiting-for-user" | "completed" | "cancelled" | "failed";
  message: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  requestCount: number;
  streamObserved: boolean;
  apiObserved: boolean;
  evidence: Array<{
    id: string;
    method: string;
    url: string;
    resourceType: string;
    status?: number;
    contentType?: string;
    streamSignal: boolean;
    apiSignal: boolean;
    firstSeenAt: string;
    count: number;
  }>;
  error?: string;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { error?: string }).error ?? `HTTP ${response.status}`);
  return payload as T;
}

export function getDiscoveryControl(): Promise<DiscoveryControlState> {
  return json("/api/discovery/control");
}

export function runDiscoveryControl(): Promise<DiscoveryControlState> {
  return json("/api/discovery/control/run", { method: "POST" });
}

export function saveDiscoveryControl(config: DiscoveryControlState["config"]): Promise<DiscoveryControlState> {
  return json("/api/discovery/control/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}

export function decideCandidate(providerId: string, decision: string): Promise<void> {
  return json(`/api/discovery/control/candidates/${encodeURIComponent(providerId)}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
}

export async function getCandidateProbes(): Promise<CandidateProbeJob[]> {
  const payload = await json<{ jobs: CandidateProbeJob[] }>("/api/discovery/probes");
  return payload.jobs;
}

export function startCandidateProbe(providerId: string): Promise<CandidateProbeJob> {
  return json("/api/discovery/probes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ providerId }),
  });
}

export function stopCandidateProbe(id: string): Promise<CandidateProbeJob> {
  return json(`/api/discovery/probes/${encodeURIComponent(id)}/stop`, {
    method: "POST",
  });
}
