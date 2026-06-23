<script lang="ts">
  import type { AppConfig } from "../lib/api";
  import { getConfig } from "../lib/api";

  let config = $state<AppConfig | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);

  $effect(() => {
    load();
  });

  async function load() {
    loading = true;
    try {
      config = await getConfig();
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }
</script>

<div class="page">
  <h2>Einstellungen</h2>

  {#if loading}
    <p class="muted">Lade Konfiguration …</p>
  {:else if error}
    <div class="card warn"><p>{error}</p></div>
  {:else if config}
    <div class="section">
      <h3>Gateway</h3>
      <dl>
        <dt>Adresse</dt>
        <dd>{config.gateway.host}:{config.gateway.port}</dd>
        <dt>Log-Level</dt>
        <dd>{config.gateway.logLevel}</dd>
        <dt>CORS</dt>
        <dd>{config.gateway.cors ? "aktiviert" : "deaktiviert"}</dd>
      </dl>
    </div>

    <div class="section">
      <h3>Account-Auswahl</h3>
      <dl>
        <dt>Strategie</dt>
        <dd>{config.selectionStrategy}</dd>
        <dt>Standard-Priorität</dt>
        <dd>{config.defaultPriority}</dd>
      </dl>
    </div>

    <div class="section">
      <h3>Cache</h3>
      <dl>
        <dt>Modell-Cache TTL</dt>
        <dd>{config.modelsCacheTTL}s</dd>
      </dl>
    </div>

    {#if config.proxy}
      <div class="section">
        <h3>Proxy</h3>
        {#each Object.entries(config.proxy) as [scope, cfg]}
          {#if cfg}
            <dl>
              <dt>{scope}</dt>
              <dd>{cfg.protocol}://{cfg.host}:{cfg.port}</dd>
            </dl>
          {/if}
        {/each}
      </div>
    {/if}

    <div class="section">
      <h3>Web-Konsole</h3>
      <dl>
        <dt>Status</dt>
        <dd>{config.ui.enabled ? "aktiviert" : "deaktiviert"}</dd>
        {#if config.ui.enabled}
          <dt>Port</dt>
          <dd>{config.ui.port}</dd>
        {/if}
      </dl>
    </div>

    <div class="card note">
      <p>Änderungen an der Konfiguration aktuell nur über <code>~/.config/zero-token/config.json</code> möglich.</p>
    </div>
  {/if}
</div>

<style>
  .page { padding: 1rem 0; }
  h2 { margin: 0 0 1.5rem 0; }
  .section {
    margin-bottom: 1.5rem;
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem;
  }
  .section h3 {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    color: var(--accent-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.4rem 1.5rem;
    font-size: 0.875rem;
  }
  dt { color: var(--muted); }
  dd { margin: 0; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem;
  }
  .card code {
    background: rgba(255,255,255,0.06);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .note {
    border-style: dashed;
    opacity: 0.7;
    font-size: 0.85rem;
  }
</style>
