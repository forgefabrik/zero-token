import { ProviderModelCatalog } from "./provider-model-catalog.js";
import { ProviderRegistry } from "./provider-registry.js";

export function createProviderService() {
  const registry = new ProviderRegistry();
  const models = new ProviderModelCatalog(registry);
  return { registry, models };
}
