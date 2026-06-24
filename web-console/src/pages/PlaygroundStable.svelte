<script lang="ts">
  import { chatCompletionStream, getModels } from "../lib/api";
  import type { ChatMessage, Model } from "../lib/api";

  type Mode = "single" | "selected" | "providers";
  type State = "waiting" | "running" | "done" | "error" | "cancelled";

  type Result = {
    id: string;
    modelId: string;
    modelName: string;
    provider: string;
    state: State;
    text: string;
    error?: string;
    ms?: number;
  };

  type Batch = {
    id: string;
    prompt: string;
    created: string;
    results: Result[];
  };

  const MAX_VISIBLE_BATCHES = 5;
  const FLUSH_INTERVAL_MS = 80;

  let models = $state<Model[]>([]);
  let mode = $state<Mode>("single");
  let single = $state("");
  let selected = $state<string[]>([]);
  let prompt = $state("");
  let batches = $state<Batch[]>([]);
  let running = $state(false);
  let pageError = $state("");

  const active = $derived(models.filter((model) => model.enabled));
  const aborters = new Map<string, AbortController>();
  const resolvers = new Map<string, () => void>();
  const chunkBuffers = new Map<string, string>();
  const flushTimers = new Map<string, number>();

  $effect(() => {
    void load();
  });

  async function load() {
    try {
      models = await getModels();
      if (!models.some((model) => model.id === single)) {
        single = models[0]?.id ?? "";
      }
      selected = selected.filter((id) => models.some((model) => model.id === id));
      if (!selected.length && models[0]) selected = [models[0].id];
      pageError = "";
    } catch (error) {
      pageError = error instanceof Error ? error.message : String(error);
    }
  }

  function toggle(id: string) {
    selected = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];
  }

  function targets(): Model[] {
    if (mode === "single") return active.filter((model) => model.id === single);
    if (mode === "selected") {
      return active.filter((model) => selected.includes(model.id));
    }

    const byProvider = new Map<string, Model>();
    for (const model of active) {
      if (!byProvider.has(model.provider)) byProvider.set(model.provider, model);
    }
    return [...byProvider.values()];
  }

  function patch(batchId: string, resultId: string, change: Partial<Result>) {
    batches = batches.map((batch) =>
      batch.id !== batchId
        ? batch
        : {
            ...batch,
            results: batch.results.map((result) =>
              result.id === resultId ? { ...result, ...change } : result,
            ),
          },
    );
  }

  function mergeStreamText(existing: string, incoming: string): string {
    if (!incoming) return existing;
    if (!existing) return incoming;
    if (incoming.startsWith(existing)) return incoming;
    if (existing.endsWith(incoming)) return existing;
    return existing + incoming;
  }

  function append(batchId: string, resultId: string, chunk: string) {
    batches = batches.map((batch) =>
      batch.id !== batchId
        ? batch
        : {
            ...batch,
            results: batch.results.map((result) =>
              result.id === resultId
                ? { ...result, text: mergeStreamText(result.text, chunk) }
                : result,
            ),
          },
    );
  }

  function flushKey(key: string, batchId: string, resultId: string) {
    const timer = flushTimers.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    flushTimers.delete(key);

    const buffered = chunkBuffers.get(key) ?? "";
    chunkBuffers.delete(key);
    if (buffered) append(batchId, resultId, buffered);
  }

  function queueChunk(batchId: string, resultId: string, chunk: string) {
    const key = `${batchId}:${resultId}`;
    const buffered = chunkBuffers.get(key) ?? "";
    chunkBuffers.set(key, mergeStreamText(buffered, chunk));
    if (flushTimers.has(key)) return;

    flushTimers.set(
      key,
      window.setTimeout(() => flushKey(key, batchId, resultId), FLUSH_INTERVAL_MS),
    );
  }

  function finishResult(resultId: string) {
    aborters.delete(resultId);
    const resolve = resolvers.get(resultId);
    resolvers.delete(resultId);
    resolve?.();
  }

  function execute(batchId: string, result: Result, text: string): Promise<void> {
    return new Promise<void>((resolve) => {
      resolvers.set(result.id, resolve);
      const started = performance.now();
      patch(batchId, result.id, { state: "running" });

      const controller = chatCompletionStream(
        result.modelId,
        [{ role: "user", content: text }] as ChatMessage[],
        (chunk) => queueChunk(batchId, result.id, chunk),
        () => {
          flushKey(`${batchId}:${result.id}`, batchId, result.id);
          patch(batchId, result.id, {
            state: "done",
            ms: Math.round(performance.now() - started),
          });
          finishResult(result.id);
        },
        (error) => {
          flushKey(`${batchId}:${result.id}`, batchId, result.id);
          patch(batchId, result.id, {
            state: "error",
            error: error.message,
            ms: Math.round(performance.now() - started),
          });
          finishResult(result.id);
        },
      );

      aborters.set(result.id, controller);
    });
  }

  async function start() {
    const text = prompt.trim();
    const list = targets();
    if (!text || !list.length || running) return;

    const id = crypto.randomUUID();
    const results: Result[] = list.map((model) => ({
      id: crypto.randomUUID(),
      modelId: model.id,
      modelName: model.name,
      provider: model.provider,
      state: "waiting",
      text: "",
    }));

    batches = [
      { id, prompt: text, created: new Date().toISOString(), results },
      ...batches,
    ].slice(0, MAX_VISIBLE_BATCHES);
    prompt = "";
    running = true;
    await Promise.allSettled(results.map((result) => execute(id, result, text)));
    running = false;
  }

  function stop() {
    for (const [resultId, controller] of aborters) {
      controller.abort();
      const batch = batches.find((item) => item.results.some((result) => result.id === resultId));
      if (batch) {
        flushKey(`${batch.id}:${resultId}`, batch.id, resultId);
        patch(batch.id, resultId, { state: "cancelled", error: "Abgebrochen" });
      }
      finishResult(resultId);
    }
    aborters.clear();
    running = false;
  }

  function clear() {
    stop();
    batches = [];
    pageError = "";
  }

  function key(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void start();
    }
  }

  function stateLabel(state: State): string {
    return {
      waiting: "wartet",
      running: "läuft",
      done: "fertig",
      error: "Fehler",
      cancelled: "abgebrochen",
    }[state];
  }
</script>

<div class="pg">
  <header>
    <div class="modes">
      <button class:on={mode === "single"} onclick={() => (mode = "single")}>Ein Modell</button>
      <button class:on={mode === "selected"} onclick={() => (mode = "selected")}>Auswahl</button>
      <button class:on={mode === "providers"} onclick={() => (mode = "providers")}>Je Provider 1×</button>
    </div>
    <div>
      <span>{new Set(active.map((model) => model.provider)).size} Provider · {active.length} Modelle</span>
      <button onclick={load}>Aktualisieren</button>
      <button onclick={clear}>Leeren</button>
    </div>
  </header>

  <section class="pick">
    {#if mode === "single"}
      <select bind:value={single}>
        {#each active as model}
          <option value={model.id}>{model.name} · {model.provider}</option>
        {/each}
      </select>
    {:else if mode === "selected"}
      <div class="checks">
        {#each active as model}
          <label class:on={selected.includes(model.id)}>
            <input
              type="checkbox"
              checked={selected.includes(model.id)}
              onchange={() => toggle(model.id)}
            />
            <span><b>{model.name}</b><small>{model.provider}</small></span>
          </label>
        {/each}
      </div>
    {:else}
      <div class="chips">
        {#each targets() as model}
          <span><b>{model.provider}</b>{model.name}</span>
        {/each}
      </div>
    {/if}
  </section>

  <section class="compose">
    <textarea
      bind:value={prompt}
      onkeydown={key}
      rows="3"
      placeholder="Dieselbe Aufgabe an alle ausgewählten Modelle senden …"
    ></textarea>
    {#if running}
      <button class="stop" onclick={stop}>Stoppen</button>
    {:else}
      <button class="run" onclick={start} disabled={!prompt.trim() || !targets().length}>
        {targets().length} testen
      </button>
    {/if}
  </section>

  {#if pageError}<p class="error">{pageError}</p>{/if}

  <main>
    {#if !batches.length}
      <div class="empty">
        <b>Modelle vergleichen</b>
        <span>Ein Modell, freie Auswahl oder automatisch ein Modell je Provider.</span>
      </div>
    {/if}

    {#each batches as batch (batch.id)}
      <section class="batch">
        <div class="batchhead">
          <b>{batch.prompt}</b>
          <time>{new Date(batch.created).toLocaleTimeString("de-DE")}</time>
        </div>
        <div class="results">
          {#each batch.results as result (result.id)}
            <article>
              <header>
                <div>
                  <b>{result.modelName}</b>
                  <small>{result.provider} · {result.modelId}</small>
                </div>
                <i class:live={result.state === "running"}>{stateLabel(result.state)}</i>
              </header>
              <pre class:error={result.state === "error"}>{result.text || result.error || (result.state === "waiting" ? "Wartet …" : "Antwort wird erzeugt …")}</pre>
              {#if result.ms !== undefined}<footer>{(result.ms / 1000).toFixed(1)} s</footer>{/if}
            </article>
          {/each}
        </div>
      </section>
    {/each}
  </main>
</div>

<style>
  .pg{min-height:calc(100dvh - 7rem);width:100%;padding:0}.pg>header,.pick,.compose{border:1px solid var(--border);background:var(--card-bg)}.pg>header{display:flex;justify-content:space-between;gap:.6rem;padding:.7rem;border-radius:10px 10px 0 0}.pg>header>div,.modes{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}button{min-height:36px;padding:0 .7rem;border:1px solid var(--border);border-radius:7px;background:rgba(255,255,255,.04);color:var(--text)}button.on,.run{background:var(--accent)}button:disabled{opacity:.4}.pg>header span{color:var(--muted);font-size:.7rem}.pick{padding:.7rem;border-top:0}.pick select,.compose textarea{width:100%;padding:.65rem;border:1px solid var(--border);border-radius:7px;background:var(--surface);color:var(--text)}.checks{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr));gap:.4rem}.checks label{display:flex;gap:.4rem;padding:.5rem;border:1px solid var(--border);border-radius:7px}.checks label.on{border-color:var(--accent)}.checks b,.checks small{display:block}.checks small{color:var(--muted)}.chips{display:flex;flex-wrap:wrap;gap:.4rem}.chips span{display:grid;padding:.45rem;border:1px solid var(--border);border-radius:7px;color:var(--muted);font-size:.7rem}.chips b{color:var(--text)}.compose{display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:.6rem;padding:.7rem;border-top:0;border-radius:0 0 10px 10px}.compose textarea{resize:vertical;min-height:78px}.stop,.error{color:#ff9aaa}main{display:grid;gap:.8rem;margin-top:.8rem}.empty{display:grid;place-items:center;gap:.3rem;min-height:200px;color:var(--muted)}.batch{width:100%;min-width:0;border:1px solid var(--border);border-radius:10px;overflow:hidden}.batchhead{display:flex;justify-content:space-between;gap:1rem;padding:.7rem;border-bottom:1px solid var(--border)}.batchhead b{min-width:0;overflow-wrap:anywhere}.batchhead time{color:var(--muted);font-size:.7rem;white-space:nowrap}.results{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:.6rem;padding:.6rem}.results article{min-width:0;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);overflow:hidden}.results article header{display:flex;justify-content:space-between;gap:.5rem;padding:.6rem;border-bottom:1px solid var(--border)}.results small{display:block;color:var(--muted);overflow-wrap:anywhere}.results i{font-style:normal;color:var(--muted)}.results i.live{color:var(--success)}pre{min-height:120px;max-height:min(56dvh,620px);overflow:auto;margin:0;padding:.7rem;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;line-height:1.5;scrollbar-gutter:stable}.results footer{padding:.35rem;text-align:right;color:var(--muted);font-size:.65rem}@media(max-width:720px){.pg>header{align-items:stretch;flex-direction:column}.compose{grid-template-columns:1fr}.compose button{width:100%}.results{grid-template-columns:minmax(0,1fr)}.batchhead{align-items:flex-start;flex-direction:column}}
</style>
