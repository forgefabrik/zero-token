export type CandidateDecision =
  | "new"
  | "account-required"
  | "approved"
  | "account-ready"
  | "rejected";

export interface DiscoveryControlConfig {
  enabled: boolean;
  runOnStart: boolean;
  intervalMinutes: number;
  minScore: number;
  inspectHomepages: boolean;
  notifyOnAccountRequired: boolean;
  sources: string[];
}

export interface CandidateReview {
  providerId: string;
  label: string;
  homepage?: string;
  kind: "web" | "api" | "local";
  models: string[];
  source?: string;
  score: number;
  valuable: boolean;
  accountRequired: boolean;
  homepageReachable: boolean;
  streamPotential: boolean;
  apiPotential: boolean;
  decision: CandidateDecision;
  reasons: string[];
  firstSeenAt: string;
  lastCheckedAt: string;
  decidedAt?: string;
  note?: string;
}

export interface DiscoveryControlState {
  config: DiscoveryControlConfig;
  reviews: CandidateReview[];
  running: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
}
