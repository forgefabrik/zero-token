import logger from "../logger.js";
import { evaluateCandidate } from "./candidate-evaluator.js";
import type {
  CandidateDecision,
  DiscoveryControlConfig,
  DiscoveryControlState,
} from "./control-types.js";
import {
  loadControlState,
  saveControlState,
  setCandidateDecision,
  updateControlConfig,
} from "./control-store.js";
import { runProviderDiscovery } from "./discovery-service.js";

let timer: NodeJS.Timeout | undefined;
let currentRun: Promise<DiscoveryControlState> | undefined;
let started = false;

function nextRunDate(intervalMinutes: number): string {
  return new Date(Date.now() + intervalMinutes * 60_000).toISOString();
}

async function scheduleFromState(state: DiscoveryControlState): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!state.config.enabled) return;

  const delay = Math.max(30_000, state.config.intervalMinutes * 60_000);
  timer = setTimeout(() => {
    void runControlledDiscovery();
  }, delay);
  timer.unref?.();
}

export async function getDiscoveryControlState(): Promise<DiscoveryControlState> {
  const state = await loadControlState();
  return { ...state, running: Boolean(currentRun) };
}

export async function configureDiscoveryControl(
  patch: Partial<DiscoveryControlConfig>,
): Promise<DiscoveryControlState> {
  const state = await updateControlConfig(patch);
  state.nextRunAt = state.config.enabled
    ? nextRunDate(state.config.intervalMinutes)
    : undefined;
  await saveControlState(state);
  await scheduleFromState(state);
  return { ...state, running: Boolean(currentRun) };
}

export function runControlledDiscovery(): Promise<DiscoveryControlState> {
  if (currentRun) return currentRun;

  currentRun = (async () => {
    const state = await loadControlState();
    state.running = true;
    state.lastError = undefined;
    await saveControlState(state);

    try {
      const snapshot = await runProviderDiscovery(
        state.config.sources.length > 0 ? state.config.sources : undefined,
      );
      const previous = new Map(state.reviews.map((review) => [review.providerId, review]));
      const reviews = [];

      for (const provider of snapshot.providers.filter((item) => item.status === "candidate")) {
        reviews.push(
          await evaluateCandidate(provider, state.config, previous.get(provider.id)),
        );
      }

      state.reviews = reviews.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
      state.lastRunAt = new Date().toISOString();
      state.nextRunAt = state.config.enabled
        ? nextRunDate(state.config.intervalMinutes)
        : undefined;
      state.lastError = snapshot.errors.length
        ? snapshot.errors.map((item) => `${item.source}: ${item.message}`).join("; ")
        : undefined;
      logger.info(
        {
          candidates: state.reviews.length,
          valuable: state.reviews.filter((review) => review.valuable).length,
        },
        "Autonome Provider-Discovery abgeschlossen",
      );
    } catch (error) {
      state.lastRunAt = new Date().toISOString();
      state.nextRunAt = state.config.enabled
        ? nextRunDate(state.config.intervalMinutes)
        : undefined;
      state.lastError = error instanceof Error ? error.message : String(error);
      logger.error({ error: state.lastError }, "Autonome Provider-Discovery fehlgeschlagen");
    } finally {
      state.running = false;
      await saveControlState(state);
      currentRun = undefined;
      await scheduleFromState(state);
    }

    return state;
  })();

  return currentRun;
}

export async function decideDiscoveryCandidate(
  providerId: string,
  decision: CandidateDecision,
  note?: string,
) {
  return setCandidateDecision(providerId, decision, note);
}

export async function startDiscoveryControl(): Promise<void> {
  if (started || process.env.NODE_ENV === "test") return;
  started = true;
  const state = await loadControlState();
  if (!state.config.enabled) return;

  if (state.config.runOnStart) {
    void runControlledDiscovery();
  } else {
    state.nextRunAt = nextRunDate(state.config.intervalMinutes);
    await saveControlState(state);
    await scheduleFromState(state);
  }
}

export function stopDiscoveryControl(): void {
  if (timer) clearTimeout(timer);
  timer = undefined;
  started = false;
}
