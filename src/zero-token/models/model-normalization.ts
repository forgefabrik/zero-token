import type { ProviderType } from "../accounts/account-types.js";
import type { ModelInfo } from "./model-types.js";

const INTERNAL_MODEL_PATTERN = /(^|[-_.])(internal|test|debug|dev|staging|shadow|legacy)([-_.]|$)/i;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeDiscoveredModels(
  provider: ProviderType,
  models: ModelInfo[],
): ModelInfo[] {
  const normalized = new Map<string, ModelInfo>();

  for (const model of models) {
    const id = clean(model.id || model.slug);
    const slug = clean(model.slug || model.id);
    const name = clean(model.name || model.id || model.slug);

    if (!id || !slug || !name || model.enabled === false) continue;
    if (INTERNAL_MODEL_PATTERN.test(id) || INTERNAL_MODEL_PATTERN.test(slug)) continue;

    const key = `${provider}:${id}`;
    normalized.set(key, {
      ...model,
      id,
      slug,
      name,
      provider,
      enabled: true,
      capabilities: {
        text: model.capabilities?.text !== false,
        vision: model.capabilities?.vision === true,
        voice: model.capabilities?.voice === true,
        plugins: model.capabilities?.plugins === true,
      },
    });
  }

  return [...normalized.values()].sort((a, b) => a.name.localeCompare(b.name));
}
