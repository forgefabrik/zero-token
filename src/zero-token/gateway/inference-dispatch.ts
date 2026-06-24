import type { InferenceProvider } from "../inference/inference-provider.js";
import { InferenceError } from "../inference/inference-provider.js";
import { getModelById } from "../models/model-service.js";
import { getProviderRuntime } from "../providers/provider-runtime-registry.js";

export async function resolveInferenceProvider(
  modelId: string,
  accountId?: string,
): Promise<InferenceProvider> {
  const model = await getModelById(modelId);
  if (!model) {
    throw new InferenceError(
      `Modell ist nicht verifiziert oder nicht verfügbar: ${modelId}`,
      404,
    );
  }

  const runtime = getProviderRuntime(model.provider);
  if (!runtime) {
    throw new InferenceError(
      `Für Provider ${model.provider} ist kein Stream-Adapter registriert.`,
      503,
      model.provider,
    );
  }

  return runtime.createInferenceProvider(accountId);
}
