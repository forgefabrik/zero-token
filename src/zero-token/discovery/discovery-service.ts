import { join } from "node:path";
import { novaHome } from "../config/paths.js";
import logger from "../logger.js";
import { readStored, writeStored } from "../storage/atomic-json-store.js";
import {
  BUILTIN_DISCOVERY_PROVIDERS,
  type DiscoveryProvider,
} from "./builtin-catalog.js";
import {
  parseDiscoveryManifest,
  validateManifestSource,
} from "./manifest.js";

export interface DiscoverySnapshot {
  scannedAt: string;
  sources: string[];
  providers: DiscoveryProvider[];
  errors: Array<{ source: string; message: string }>;
}

const MAX_MANIFEST_BYTES = 1_000_000;

function cachePath(): string {
  return join(novaHome(), "discovery-cache.json");
}

function configuredSources(explicit?: string[]): string[] {
  const values = explicit?.length
    ? explicit
    : (process.env.NOVA_DISCOVERY_SOURCES ?? "")
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean);
  return [...new Set(values)];
}

async function loadSource(source: string): Promise<DiscoveryProvider[]> {
  const url = validateManifestSource(source);
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Nova-Discovery/1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_MANIFEST_BYTES) throw new Error("Manifest ist zu groß.");

  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_MANIFEST_BYTES) {
    throw new Error("Manifest ist zu groß.");
  }
  return parseDiscoveryManifest(raw, source);
}

export async function runProviderDiscovery(
  explicitSources?: string[],
): Promise<DiscoverySnapshot> {
  const sources = configuredSources(explicitSources);
  const providers = new Map<string, DiscoveryProvider>(
    BUILTIN_DISCOVERY_PROVIDERS.map((provider) => [provider.id, { ...provider }]),
  );
  const errors: DiscoverySnapshot["errors"] = [];

  for (const source of sources) {
    try {
      const discovered = await loadSource(source);
      for (const candidate of discovered) {
        const existing = providers.get(candidate.id);
        if (existing?.status === "supported") {
          providers.set(candidate.id, {
            ...existing,
            models: [...new Set([...existing.models, ...candidate.models])],
            source,
          });
        } else {
          providers.set(candidate.id, candidate);
        }
      }
      logger.info({ source, providers: discovered.length }, "Discovery-Manifest geladen");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ source, message });
      logger.warn({ source, error: message }, "Discovery-Quelle konnte nicht geladen werden");
    }
  }

  const snapshot: DiscoverySnapshot = {
    scannedAt: new Date().toISOString(),
    sources,
    providers: [...providers.values()].sort((a, b) => a.label.localeCompare(b.label)),
    errors,
  };
  await writeStored(cachePath(), snapshot);
  return snapshot;
}

export async function getDiscoverySnapshot(): Promise<DiscoverySnapshot> {
  return (await readStored<DiscoverySnapshot>(cachePath())) ?? runProviderDiscovery([]);
}

export async function getDiscoveredModelCandidates(): Promise<
  Array<{ id: string; provider: string; label: string }>
> {
  const snapshot = await getDiscoverySnapshot();
  return snapshot.providers.flatMap((provider) =>
    provider.models.map((id) => ({ id, provider: provider.id, label: provider.label })),
  );
}
