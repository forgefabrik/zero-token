import type { InferenceProvider } from "../inference/inference-provider.js";
import { InferenceError } from "../inference/inference-provider.js";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../inference/types.js";
import { getModelById } from "../models/model-service.js";
import { getProviderRuntime } from "../providers/provider-runtime-registry.js";

const queues = new Map<string, Promise<void>>();

async function acquire(provider: string): Promise<() => void> {
  const previous = queues.get(provider) ?? Promise.resolve();
  let unlock = () => {};
  const current = new Promise<void>((resolve) => {
    unlock = resolve;
  });
  const tail = previous.then(() => current);
  queues.set(provider, tail);
  await previous;

  let done = false;
  return () => {
    if (done) return;
    done = true;
    unlock();
    void tail.finally(() => {
      if (queues.get(provider) === tail) queues.delete(provider);
    });
  };
}

class SerializedProvider implements InferenceProvider {
  readonly provider: string;

  constructor(private readonly inner: InferenceProvider) {
    this.provider = inner.provider;
  }

  async chatCompletion(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ChatCompletionResponse> {
    const release = await acquire(this.provider);
    try {
      return await this.inner.chatCompletion(request, options);
    } finally {
      release();
    }
  }

  async chatCompletionStream(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ReadableStream<ChatCompletionChunk>> {
    const release = await acquire(this.provider);
    let source: ReadableStream<ChatCompletionChunk>;
    try {
      source = await this.inner.chatCompletionStream(request, options);
    } catch (error) {
      release();
      throw error;
    }

    const reader = source.getReader();
    let released = false;
    const finish = () => {
      if (released) return;
      released = true;
      release();
    };

    return new ReadableStream<ChatCompletionChunk>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            finish();
            reader.releaseLock();
            controller.close();
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          finish();
          reader.releaseLock();
          controller.error(error);
        }
      },
      async cancel(reason) {
        finish();
        await reader.cancel(reason);
        reader.releaseLock();
      },
    });
  }
}

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

  return new SerializedProvider(await runtime.createInferenceProvider(accountId));
}
