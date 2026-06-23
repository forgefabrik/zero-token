import type {
  DiscoveryProvider,
  DiscoveryProviderKind,
} from "./builtin-catalog.js";

export interface DiscoveryManifest {
  version: 1;
  providers: Array<{
    id: string;
    label: string;
    kind?: DiscoveryProviderKind;
    homepage?: string;
    models?: string[];
  }>;
}

const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,159}$/;

export function validateManifestSource(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") {
    throw new Error("Discovery erlaubt ausschließlich HTTPS-Manifeste von raw.githubusercontent.com.");
  }
  return url;
}

export function parseDiscoveryManifest(raw: string, source: string): DiscoveryProvider[] {
  const parsed = JSON.parse(raw) as DiscoveryManifest;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.providers)) {
    throw new Error("Ungültiges Discovery-Manifest.");
  }

  return parsed.providers.flatMap((value) => {
    if (!PROVIDER_ID.test(value.id) || typeof value.label !== "string") return [];

    let homepage: string | undefined;
    if (value.homepage) {
      try {
        const url = new URL(value.homepage);
        if (url.protocol === "https:") homepage = url.toString();
      } catch {
        homepage = undefined;
      }
    }

    const models = [...new Set(value.models ?? [])]
      .filter((model) => MODEL_ID.test(model))
      .slice(0, 500);

    return [{
      id: value.id,
      label: value.label.trim().slice(0, 100),
      kind: value.kind ?? "api",
      status: "candidate" as const,
      homepage,
      models,
      source,
    }];
  });
}
