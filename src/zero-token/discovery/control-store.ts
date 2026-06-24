import { join } from "node:path";
import { novaHome } from "../config/paths.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import { validateManifestSource } from "./manifest.js";
import type {
  CandidateDecision,
  CandidateReview,
  DiscoveryControlConfig,
  DiscoveryControlState,
} from "./control-types.js";

const DEFAULT_CONFIG: DiscoveryControlConfig = {
  enabled: true,
  runOnStart: true,
  intervalMinutes: 360,
  minScore: 55,
  inspectHomepages: true,
  notifyOnAccountRequired: true,
  sources: [],
};

function controlPath(): string {
  return join(novaHome(), "discovery-control.json");
}

function normalizeSources(values: string[] | undefined): string[] {
  return [...new Set(values ?? [])]
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => validateManifestSource(value).toString())
    .slice(0, 20);
}

export function normalizeControlConfig(
  input: Partial<DiscoveryControlConfig> = {},
): DiscoveryControlConfig {
  return {
    enabled: input.enabled ?? DEFAULT_CONFIG.enabled,
    runOnStart: input.runOnStart ?? DEFAULT_CONFIG.runOnStart,
    intervalMinutes: Math.max(
      30,
      Math.min(10_080, Math.trunc(input.intervalMinutes ?? DEFAULT_CONFIG.intervalMinutes)),
    ),
    minScore: Math.max(0, Math.min(100, Math.trunc(input.minScore ?? DEFAULT_CONFIG.minScore))),
    inspectHomepages: input.inspectHomepages ?? DEFAULT_CONFIG.inspectHomepages,
    notifyOnAccountRequired:
      input.notifyOnAccountRequired ?? DEFAULT_CONFIG.notifyOnAccountRequired,
    sources: normalizeSources(input.sources),
  };
}

export async function loadControlState(): Promise<DiscoveryControlState> {
  const stored = await readStored<DiscoveryControlState>(controlPath());
  if (!stored) {
    return { config: DEFAULT_CONFIG, reviews: [], running: false };
  }

  return {
    ...stored,
    config: normalizeControlConfig(stored.config),
    reviews: Array.isArray(stored.reviews) ? stored.reviews : [],
    running: false,
  };
}

export async function saveControlState(state: DiscoveryControlState): Promise<void> {
  await writeStored(controlPath(), {
    ...state,
    config: normalizeControlConfig(state.config),
  });
}

export async function updateControlConfig(
  patch: Partial<DiscoveryControlConfig>,
): Promise<DiscoveryControlState> {
  const state = await loadControlState();
  state.config = normalizeControlConfig({ ...state.config, ...patch });
  await saveControlState(state);
  return state;
}

export async function setCandidateDecision(
  providerId: string,
  decision: CandidateDecision,
  note?: string,
): Promise<CandidateReview> {
  const state = await loadControlState();
  const review = state.reviews.find((item) => item.providerId === providerId);
  if (!review) throw new Error(`Discovery-Kandidat nicht gefunden: ${providerId}`);

  review.decision = decision;
  review.note = note?.trim().slice(0, 500) || undefined;
  review.decidedAt = new Date().toISOString();
  await saveControlState(state);
  return review;
}
