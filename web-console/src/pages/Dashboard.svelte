<script lang="ts">
  import { getStatus, getHealth, getConfig } from "../lib/api";

  let status = $state<{ accounts: number; validSessions: number; models: number; timestamp: string } | null>(null);
  let health = $state<{ status: string } | null>(null);
  let config = $state<{ gateway: { host: string; port: number } } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      const [s, h, c] = await Promise.all([
        getStatus(),
        getHealth(),
        getConfig(),
      ]);
      status = s;
      health = h;
      config = c;
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }
</script>

<div class="page">
  <h2>Dashboard</h2>

  {#if loading}
    <p class="muted">Lade Daten …</p>
  {:else if error}
    <div class="card warn">
      <p>Gateway nicht erreichbar: {error}</p>
      <button class="btn" onclick={load}>Erneut versuchen</button>
    </div>
  {:else}
    <div class="stats">
      <div class="stat-card">
        <span class="stat-value">{status?.accounts ?? 0}</span>
        <span class="stat-label">Accounts</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{status?.validSessions ?? 0}</span>
        <span class="stat-label">Gültige Sessions</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{status?.models ?? 0}</span>
        <span class="stat-label">Modelle</span>
      </div>
      <div class="stat-card">
        <span class="stat-value">{health?.status === "ok" ? "✓" : "✗"}</span>
        <span class="stat-label">Gateway</span>
      </div>
    </div>

    <div class="card-grid">
      <div class="card">
        <h3>Gateway</h3>
        {#if config}
          <dl>
            <dt>Adresse</dt>
            <dd>{config.gateway.host}:{config.gateway.port}</dd>
            <dt>Status</dt>
            <dd class="ok">{health?.status ?? "unbekannt"}</dd>
          </dl>
        {/if}
      </div>

      <div class="card">
        <h3>Letzte Aktualisierung</h3>
        <p class="muted">{status?.timestamp ? new Date(status.timestamp).toLocaleString("de-DE") : "–"}</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    padding: 1rem 0;
  }
  h2 {
    margin: 0 0 1.5rem 0;
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .stat-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem;
    text-align: center;
  }
  .stat-value {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: var(--accent);
  }
  .stat-label {
    display: block;
    font-size: 0.8rem;
    color: var(--muted);
    margin-top: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem;
  }
  .card h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1rem;
    font-size: 0.875rem;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
  }
  .ok {
    color: #7bed9f;
  }
  .warn {
    border-color: var(--accent-secondary);
  }
  .btn {
    margin-top: 0.75rem;
  }
</style>
