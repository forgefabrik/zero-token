import type {
  CandidateProbeEvidence,
  CandidateProbeJob,
  CandidateProbeStatus,
} from "./candidate-probe-types.js";

const jobs = new Map<string, CandidateProbeJob>();
const MAX_JOBS = 30;
const MAX_EVIDENCE = 150;

export function cloneProbeJob(job: CandidateProbeJob): CandidateProbeJob {
  return { ...job, evidence: job.evidence.map((item) => ({ ...item })) };
}

export function putProbeJob(job: CandidateProbeJob): CandidateProbeJob {
  jobs.set(job.id, job);
  trimProbeJobs();
  return job;
}

export function updateProbeJob(
  id: string,
  patch: Partial<CandidateProbeJob>,
): CandidateProbeJob {
  const current = jobs.get(id);
  if (!current) throw new Error(`Probe-Job nicht gefunden: ${id}`);
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  jobs.set(id, next);
  return next;
}

export function addProbeEvidence(
  jobId: string,
  evidence: CandidateProbeEvidence,
): void {
  const job = jobs.get(jobId);
  if (!job) return;

  const existing = job.evidence.find((item) => item.id === evidence.id);
  if (existing) {
    existing.count += 1;
    existing.status = evidence.status ?? existing.status;
    existing.contentType = evidence.contentType ?? existing.contentType;
    existing.streamSignal ||= evidence.streamSignal;
    existing.apiSignal ||= evidence.apiSignal;
  } else if (job.evidence.length < MAX_EVIDENCE) {
    job.evidence.push(evidence);
  }

  job.requestCount += 1;
  job.streamObserved ||= evidence.streamSignal;
  job.apiObserved ||= evidence.apiSignal;
  job.updatedAt = new Date().toISOString();
}

export function listStoredProbeJobs(): CandidateProbeJob[] {
  return [...jobs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(cloneProbeJob);
}

export function getStoredProbeJob(id: string): CandidateProbeJob | undefined {
  const job = jobs.get(id);
  return job ? cloneProbeJob(job) : undefined;
}

export function finishStoredProbeJob(
  id: string,
  status: CandidateProbeStatus,
  message: string,
  error?: string,
): CandidateProbeJob {
  return updateProbeJob(id, {
    status,
    message,
    error,
    completedAt: new Date().toISOString(),
  });
}

function trimProbeJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const completed = [...jobs.values()]
    .filter((job) => ["completed", "cancelled", "failed"].includes(job.status))
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
  for (const job of completed.slice(0, jobs.size - MAX_JOBS)) jobs.delete(job.id);
}
