<script lang="ts">
  import type { Model } from "../lib/api";
  import { getModels, refreshModels } from "../lib/api";

  let models = $state<Model[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let lastRefresh = $state<string | null>(null);

  $effect(() => {
    load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      models = await getModels();
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }

  async function handleRefresh() {
    refreshing = true;
    try {
      const result = await refreshModels();
      models = result.models;
      lastRefresh = new Date().toLocaleTimeString("de-DE");
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler";
    } finally {
      refreshing = false;
    }
  }
</script>

<div class="page">
  <div class="header">
    <h2>Modelle</h2>
    <button class="btn" onclick={handleRefresh} disabled={refreshing}>
      {refreshing ? "Aktualisiere …" : "Cache neu laden"}
    </button>
  </div>

  {#if lastRefresh}
    <p class="muted">Zuletzt aktualisiert: {lastRefresh} · {models.length} Modelle</p>
  {/if}

  {#if loading}
    <p class="muted">Lade Modelle …</p>
  {:else if error}
    <div class="card warn"><p>{error}</p></div>
  {:else if models.length === 0}
    <div class="card empty">
      <p>Keine Modelle gefunden.</p>
      <p class="muted">Führe <code>zt models refresh</code> aus oder lege einen Account an.</p>
    </div>
  {:else}
    <div class="grid">
      {#each models as model}
        <div class="model-card" class:disabled={!model.enabled}>
          <div class="model-name">{model.name}</div>
          <div class="model-id">{model.id}</div>
          <div class="model-meta">
            <span class="badge">{model.provider}</span>
            {#if model.capabilities.vision}
              <span class="tag">vision</span>
            {/if}
            {#if model.capabilities.voice}
              <span class="tag">voice</span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .page { padding: 1rem 0; }
  h2 { margin: 0; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
  }
  .model-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem;
    transition: border-color 0.15s;
  }
  .model-card:hover {
    border-color: var(--accent);
  }
  .model-card.disabled {
    opacity: 0.4;
  }
  .model-name {
    font-weight: 600;
    font-size: 0.95rem;
    margin-bottom: 0.2rem;
  }
  .model-id {
    font-size: 0.78rem;
    color: var(--muted);
    font-family: "SF Mono", "Fira Code", monospace;
    margin-bottom: 0.6rem;
  }
  .model-meta {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .badge {
    background: var(--accent);
    color: #fff;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
  }
  .tag {
    background: rgba(164, 144, 194, 0.15);
    color: var(--accent-secondary);
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
    font-size: 0.7rem;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
  }
  .card code {
    background: rgba(255,255,255,0.06);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .empty p { margin: 0.25rem 0; }
  .muted { margin-top: 0.25rem; margin-bottom: 1rem; }
</style>
