<script lang="ts">
  interface ProviderCandidate {
    id: string;
    label: string;
    kind: "web" | "api" | "local";
    status: "supported" | "candidate";
    homepage?: string;
    models: string[];
    source?: string;
  }

  interface Snapshot {
    scannedAt: string;
    sources: string[];
    providers: ProviderCandidate[];
    errors: Array<{ source: string; message: string }>;
  }

  let snapshot = $state<Snapshot | null>(null);
  let loading = $state(true);
  let scanning = $state(false);
  let error = $state<string | null>(null);
  let query = $state("");
  let status = $state<"all" | "supported" | "candidate">("all");
  let kind = $state<"all" | "web" | "api" | "local">("all");

  const filtered = $derived(
    (snapshot?.providers ?? []).filter((provider) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        !needle ||
        provider.id.toLowerCase().includes(needle) ||
        provider.label.toLowerCase().includes(needle) ||
        provider.models.some((model) => model.toLowerCase().includes(needle));
      return (
        matchesQuery &&
        (status === "all" || provider.status === status) &&
        (kind === "all" || provider.kind === kind)
      );
    }),
  );

  const modelCount = $derived(
    (snapshot?.providers ?? []).reduce((sum, provider) => sum + provider.models.length, 0),
  );

  $effect(() => {
    void load();
  });

  async function requestSnapshot(scan = false) {
    const response = await fetch(scan ? "/api/discovery/scan" : "/api/discovery", {
      method: scan ? "POST" : "GET",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as Snapshot;
  }

  async function load() {
    loading = true;
    error = null;
    try {
      snapshot = await requestSnapshot();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Discovery konnte nicht geladen werden";
    } finally {
      loading = false;
    }
  }

  async function scan() {
    scanning = true;
    error = null;
    try {
      snapshot = await requestSnapshot(true);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Discovery-Scan fehlgeschlagen";
    } finally {
      scanning = false;
    }
  }

  function formatDate(value?: string) {
    if (!value) return "Noch nicht ausgeführt";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "medium",
    }).format(new Date(value));
  }
</script>

<div class="page">
  <section class="hero">
    <div>
      <span class="eyebrow">Provider Discovery</span>
      <h2>Neue LLM-Anbieter erkennen</h2>
      <p>
        Nova synchronisiert streng validierte GitHub-Manifeste. Neue Einträge bleiben Kandidaten,
        bis ein sicherer Login- oder API-Adapter vorhanden ist.
      </p>
    </div>
    <button class="btn primary" onclick={scan} disabled={scanning}>
      {scanning ? "Scanne …" : "Jetzt synchronisieren"}
    </button>
  </section>

  <div class="stats">
    <article><span>Provider</span><strong>{snapshot?.providers.length ?? 0}</strong></article>
    <article><span>Kandidaten</span><strong>{snapshot?.providers.filter((p) => p.status === "candidate").length ?? 0}</strong></article>
    <article><span>Modell-IDs</span><strong>{modelCount}</strong></article>
    <article><span>Quellen</span><strong>{snapshot?.sources.length ?? 0}</strong></article>
  </div>

  {#if snapshot}
    <div class="last-scan">Letzter Scan: {formatDate(snapshot.scannedAt)}</div>
  {/if}

  {#if error}
    <div class="notice error"><strong>Discovery-Fehler</strong><span>{error}</span></div>
  {/if}

  {#if snapshot?.errors.length}
    <div class="source-errors">
      {#each snapshot.errors as item}
        <div><code>{item.source}</code><span>{item.message}</span></div>
      {/each}
    </div>
  {/if}

  {#if loading}
    <div class="grid">{#each Array(8) as _}<div class="skeleton"></div>{/each}</div>
  {:else}
    <section class="filters" aria-label="Discovery filtern">
      <label class="search">
        <span>⌕</span>
        <input bind:value={query} placeholder="Provider oder Modell suchen" />
      </label>
      <select bind:value={status} aria-label="Status filtern">
        <option value="all">Alle Status</option>
        <option value="supported">Unterstützt</option>
        <option value="candidate">Kandidat</option>
      </select>
      <select bind:value={kind} aria-label="Typ filtern">
        <option value="all">Alle Typen</option>
        <option value="web">Web</option>
        <option value="api">API</option>
        <option value="local">Lokal</option>
      </select>
    </section>

    <div class="grid">
      {#each filtered as provider}
        <article class="provider-card">
          <div class="card-head">
            <div class="mark">{provider.label.slice(0, 2).toUpperCase()}</div>
            <div>
              <h3>{provider.label}</h3>
              <code>{provider.id}</code>
            </div>
            <span class="status status-{provider.status}">{provider.status}</span>
          </div>

          <div class="meta">
            <span>{provider.kind}</span>
            <span>{provider.models.length} Modelle</span>
          </div>

          {#if provider.models.length}
            <div class="models">
              {#each provider.models.slice(0, 8) as model}<code>{model}</code>{/each}
              {#if provider.models.length > 8}<span>+{provider.models.length - 8}</span>{/if}
            </div>
          {:else}
            <p class="muted">Modelle werden über die aktive Provider-Session ermittelt.</p>
          {/if}

          {#if provider.status === "candidate"}
            <div class="candidate-note">Noch nicht für Inference aktiviert</div>
          {/if}
        </article>
      {/each}
    </div>

    {#if filtered.length === 0}
      <div class="notice"><strong>Keine Treffer</strong><span>Ändere Suche oder Filter.</span></div>
    {/if}
  {/if}

  <div class="security-note">
    <strong>Sicherer Discovery-Modus</strong>
    <span>Nur HTTPS-Manifeste von raw.githubusercontent.com werden akzeptiert. Kandidaten werden niemals automatisch angemeldet oder aktiviert.</span>
  </div>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; padding: 1.4rem; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(135deg, rgba(67,217,163,0.1), rgba(124,108,242,0.15)); }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.65rem, 4vw, 2.35rem); }
  .hero p { max-width: 720px; margin: 0.55rem 0 0; color: var(--muted); line-height: 1.55; }
  .primary { background: linear-gradient(135deg, #7c6cf2, #5d75f7); border-color: transparent; white-space: nowrap; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.7rem; margin: 0.9rem 0; }
  .stats article { padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 13px; background: var(--card-bg); }
  .stats span, .stats strong { display: block; }
  .stats span { color: var(--muted); font-size: 0.68rem; text-transform: uppercase; }
  .stats strong { margin-top: 0.2rem; font-size: 1.35rem; }
  .last-scan { margin-bottom: 0.7rem; color: var(--muted); font-size: 0.7rem; }
  .filters { display: grid; grid-template-columns: minmax(220px, 1fr) 170px 150px; gap: 0.65rem; margin-bottom: 0.75rem; }
  .search { display: flex; align-items: center; gap: 0.5rem; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  input, select { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); padding: 0 0.75rem; }
  .search input { border: 0; background: transparent; padding: 0; outline: 0; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 0.75rem; }
  .provider-card { display: flex; flex-direction: column; gap: 0.8rem; min-height: 205px; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); }
  .card-head { display: flex; align-items: center; gap: 0.65rem; }
  .mark { display: grid; place-items: center; width: 40px; height: 40px; flex: 0 0 auto; border-radius: 11px; background: rgba(124,108,242,0.13); color: var(--accent-secondary); font-size: 0.7rem; font-weight: 800; }
  .card-head > div:nth-child(2) { min-width: 0; flex: 1; }
  h3 { margin: 0; font-size: 0.92rem; }
  .card-head code { display: block; margin-top: 0.18rem; color: var(--muted); }
  .status { padding: 0.18rem 0.45rem; border-radius: 999px; font-size: 0.62rem; text-transform: capitalize; }
  .status-supported { color: var(--success); background: rgba(67,217,163,0.1); }
  .status-candidate { color: #ffd166; background: rgba(255,209,102,0.1); }
  .meta { display: flex; gap: 0.4rem; }
  .meta span { padding: 0.2rem 0.45rem; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 0.66rem; }
  .models { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .models code, .models span { padding: 0.24rem 0.42rem; border-radius: 7px; background: rgba(5,9,17,0.48); color: #cbd5e6; font-size: 0.65rem; }
  .candidate-note { margin-top: auto; color: #ffd166; font-size: 0.68rem; }
  .notice, .security-note { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.75rem; padding: 0.85rem 0.95rem; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); font-size: 0.72rem; }
  .notice strong, .security-note strong { color: var(--text); }
  .notice.error { border-color: rgba(255,111,133,0.28); color: var(--danger); }
  .source-errors { display: grid; gap: 0.4rem; margin-bottom: 0.75rem; }
  .source-errors div { display: grid; gap: 0.2rem; padding: 0.65rem; border: 1px solid rgba(255,111,133,0.2); border-radius: 9px; color: var(--danger); font-size: 0.68rem; }
  .source-errors code { overflow: hidden; text-overflow: ellipsis; color: #ff9aaa; }
  .skeleton { height: 205px; border-radius: 15px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (max-width: 760px) { .hero { align-items: stretch; flex-direction: column; } .stats { grid-template-columns: repeat(2, 1fr); } .filters { grid-template-columns: 1fr; } .grid { grid-template-columns: 1fr; } }
</style>
