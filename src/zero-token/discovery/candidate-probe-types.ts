export type CandidateProbeStatus =
  | "starting"
  | "waiting-for-user"
  | "completed"
  | "cancelled"
  | "failed";

export interface CandidateProbeEvidence {
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
}

export interface CandidateProbeJob {
  id: string;
  providerId: string;
  providerLabel: string;
  homepage: string;
  status: CandidateProbeStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  requestCount: number;
  streamObserved: boolean;
  apiObserved: boolean;
  evidence: CandidateProbeEvidence[];
  error?: string;
}
