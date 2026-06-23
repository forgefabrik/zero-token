<script lang="ts">
  import type { Model } from "../lib/api";
  import { getModels, refreshModels } from "../lib/api";
  import { getProviderMeta } from "../lib/providers";

  let models = $state<Model[]>([]);
  let loading = $state(true);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let lastRefresh = $state<string | null>(null);
  let query = $state("");
  let providerFilter = $state("all");
  let capabilityFilter = $state("all");
  let copied = $state<string | null>(null);

  const providers = $derived([...new Set(models.map((model) => model.provider))].sort());
  const filteredModels = $derived(
    models.filter((model) => {
      const needle = query.trim().toLowerCase();
      const provider = getProviderMeta(model.provider);
      const matchesQuery =
        !needle ||
        model.name.toLowerCase().includes(needle) ||
        model.id.toLowerCase().includes(needle) ||
        model.provider.toLowerCase().includes(needle) ||
        provider?.label.toLowerCase().includes(needle);
      const matchesProvider = providerFilter === "all" || model.provider === providerFilter;
      const matchesCapability =
        capabilityFilter === "all" || Boolean(model.capabilities[capabilityFilter]);
      return matchesQuery && matchesProvider && matchesCapability;
    }),
  );

  $effect(() => {
    void load();
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
    error = null;
    try {
      const result = await refreshModels();
      models = result.models;
      lastRefresh = new Intl.DateTimeFormat("de-DE", { timeStyle: "medium" }).format(new Date());
    } catch (err) {
      error = err instanceof Error ? err.message : "Aktualisierung fehlgeschlagen";
    } finally {
      refreshing = false;
    }
  }

  async function copyModelId(id: string) {
    await navigator.clipboard.writeText(id);
    copied = id;
    window.setTimeout(() => {
      if (copied === id) copied = null;
    }, 1600);
  }
</script>

<div class="page">
  <section class="header">
    <div>
      <span class="eyebrow">Model Registry</span>
      <h2>Modelle</h2>
      <p>Durchsuche den lokalen Modellcache und kopiere Modell-IDs direkt für API-Aufrufe.</p>
    </div>
    <button class="btn primary" onclick={handleRefresh} disabled={refreshing}>
      {refreshing ? "Aktualisiere …" : "Modellcache aktualisieren"}
    </button>
  </section>

  <div class="overview">
    <div><strong>{models.length}</strong><span>Modelle</span></div>
    <div><strong>{providers.length}</strong><span>Provider</span></div>
    <div><strong>{models.filter((model) => model.capabilities.vision).length}</strong><span>Vision</span></div>
    <div><strong>{models.filter((model) => model.capabilities.voice).length}</strong><span>Voice</span></div>
  </div>

  {#if lastRefresh}
    <div class="refresh-note" role="status">Cache aktualisiert um {lastRefresh} · {models.length} Modelle geladen</div>
  {/if}

  {#if loading}
    <div class="model-grid">{#each Array(8) as _}<div class="skeleton"></div>{/each}</div>
  {:else if error}
    <div class="state-card">
      <strong>Modelle konnten nicht geladen werden</strong>
      <span>{error}</span>
      <button class="btn" onclick={load}>Erneut versuchen</button>
    </div>
  {:else if models.length === 0}
    <div class="state-card empty">
      <div class="empty-icon">◇</div>
      <strong>Noch keine Modelle im Cache</strong>
      <span>Verbinde einen Account oder aktualisiere den Modellcache.</span>
      <button class="btn primary" onclick={handleRefresh}>Cache aktualisieren</button>
    </div>
  {:else}
    <section class="filters" aria-label="Modelle filtern">
      <label class="search">
        <span>⌕</span>
        <input bind:value={query} placeholder="Modellname oder ID suchen" aria-label="Modelle suchen" />
      </label>
      <select bind:value={providerFilter} aria-label="Provider filtern">
        <option value="all">Alle Provider</option>
        {#each providers as provider}<option value={provider}>{getProviderMeta(provider)?.label ?? provider}</option>{/each}
      </select>
      <select bind:value={capabilityFilter} aria-label="Fähigkeit filtern">
        <option value="all">Alle Fähigkeiten</option>
        <option value="vision">Vision</option>
        <option value="voice">Voice</option>
        <option value="plugins">Plugins</option>
        <option value="text">Text</option>
      </select>
    </section>

    <div class="result-line">{filteredModels.length} von {models.length} Modellen</div>

    {#if filteredModels.length === 0}
      <div class="state-card"><strong>Keine Treffer</strong><span>Ändere Suche oder Filter.</span></div>
    {:else}
      <div class="model-grid">
        {#each filteredModels as model}
          {@const provider = getProviderMeta(model.provider)}
          <article class:disabled={!model.enabled} class="model-card">
            <div class="card-top">
              <div class="provider-mark" style={`--provider-color:${provider?.color ?? "#8f7aff"}`}>
                {(provider?.shortLabel ?? model.provider).slice(0, 2).toUpperCase()}
              </div>
              <div class="title">
                <h3>{model.name}</h3>
                <span>{provider?.label ?? model.provider}</span>
              </div>
              <span class:enabled={model.enabled} class="availability">{model.enabled ? "Aktiv" : "Inaktiv"}</span>
            </div>

            <button class="model-id" onclick={() => copyModelId(model.id)} title="Modell-ID kopieren">
              <code>{model.id}</code>
              <span>{copied === model.id ? "Kopiert" : "Kopieren"}</span>
            </button>

            <div class="capabilities">
              {#each Object.entries(model.capabilities).filter(([, enabled]) => enabled) as [capability]}
                <span>{capability}</span>
              {/each}
              {#if !Object.values(model.capabilities).some(Boolean)}<span>text</span>{/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .header { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.65rem, 4vw, 2.35rem); }
  .header p { margin: 0.55rem 0 0; color: var(--muted); line-height: 1.55; }
  .primary { background: linear-gradient(135deg, #7c6cf2, #5d75f7); border-color: transparent; }
  .overview { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.7rem; margin: 1.1rem 0; }
  .overview div { padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 13px; background: var(--card-bg); }
  .overview strong, .overview span { display: block; }
  .overview strong { font-size: 1.3rem; }
  .overview span { margin-top: 0.15rem; color: var(--muted); font-size: 0.72rem; }
  .refresh-note { margin-bottom: 0.8rem; padding: 0.65rem 0.8rem; border: 1px solid rgba(67,217,163,0.22); border-radius: 10px; color: var(--success); background: rgba(67,217,163,0.07); font-size: 0.78rem; }
  .filters { display: grid; grid-template-columns: minmax(260px, 1fr) 220px 180px; gap: 0.7rem; }
  .search { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.8rem; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); }
  input, select { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); color: var(--text); padding: 0 0.75rem; }
  .search input { border: 0; background: transparent; padding: 0; outline: 0; }
  .result-line { margin: 0.75rem 0; color: var(--muted); font-size: 0.75rem; }
  .model-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 0.8rem; }
  .model-card { display: grid; gap: 1rem; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); transition: transform 0.16s ease, border-color 0.16s ease; }
  .model-card:hover { transform: translateY(-2px); border-color: rgba(143,122,255,0.58); }
  .model-card.disabled { opacity: 0.55; }
  .card-top { display: flex; align-items: center; gap: 0.7rem; }
  .provider-mark { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 11px; background: color-mix(in srgb, var(--provider-color) 20%, transparent); border: 1px solid color-mix(in srgb, var(--provider-color) 50%, transparent); color: var(--provider-color); font-weight: 800; font-size: 0.72rem; }
  .title { min-width: 0; flex: 1; }
  h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.95rem; }
  .title span { display: block; margin-top: 0.2rem; color: var(--muted); font-size: 0.72rem; }
  .availability { padding: 0.18rem 0.42rem; border-radius: 999px; background: rgba(145,160,184,0.1); color: var(--muted); font-size: 0.64rem; }
  .availability.enabled { color: var(--success); background: rgba(67,217,163,0.1); }
  .model-id { display: flex; align-items: center; gap: 0.5rem; width: 100%; min-width: 0; padding: 0.58rem 0.65rem; border: 1px solid var(--border); border-radius: 9px; background: rgba(5,9,17,0.52); color: var(--muted); cursor: pointer; text-align: left; }
  .model-id code { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e6; }
  .model-id span { font-size: 0.66rem; }
  .capabilities { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .capabilities span { padding: 0.22rem 0.48rem; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 0.68rem; }
  .state-card { display: grid; justify-items: start; gap: 0.55rem; padding: 1.3rem; border: 1px dashed var(--border); border-radius: 15px; color: var(--muted); }
  .state-card strong { color: var(--text); }
  .empty { justify-items: center; padding: 3rem 1rem; text-align: center; }
  .empty-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(124,108,242,0.12); color: var(--accent); font-size: 1.4rem; }
  .skeleton { height: 170px; border-radius: 15px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (max-width: 760px) {
    .header { align-items: stretch; flex-direction: column; }
    .header .btn { width: 100%; }
    .overview { grid-template-columns: repeat(2, 1fr); }
    .filters { grid-template-columns: 1fr; }
    .model-grid { grid-template-columns: 1fr; }
  }
</style>
