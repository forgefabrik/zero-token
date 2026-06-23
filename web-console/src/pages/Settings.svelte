<script lang="ts">
  import type { AppConfig } from "../lib/api";
  import { getConfig } from "../lib/api";

  let config = $state<AppConfig | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let copied = $state(false);

  $effect(() => {
    void load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      config = await getConfig();
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }

  async function copyConfigPath() {
    await navigator.clipboard.writeText("~/.config/zero-token/config.json");
    copied = true;
    window.setTimeout(() => (copied = false), 1500);
  }
</script>

<div class="page">
  <section class="header">
    <div>
      <span class="eyebrow">Lokale Konfiguration</span>
      <h2>Einstellungen</h2>
      <p>Eine sichere, schreibgeschützte Übersicht der aktuell geladenen Gateway-Konfiguration.</p>
    </div>
    <button class="btn" onclick={load} disabled={loading}>{loading ? "Lädt …" : "Neu laden"}</button>
  </section>

  {#if loading}
    <div class="settings-grid">{#each Array(4) as _}<div class="skeleton"></div>{/each}</div>
  {:else if error}
    <div class="state-card"><strong>Konfiguration nicht erreichbar</strong><span>{error}</span><button class="btn" onclick={load}>Erneut versuchen</button></div>
  {:else if config}
    <div class="settings-grid">
      <section class="setting-card featured">
        <div class="card-icon">↗</div>
        <div class="card-head"><div><span>Gateway</span><h3>{config.gateway.host}:{config.gateway.port}</h3></div><span class="status">Lokal</span></div>
        <dl>
          <div><dt>Host</dt><dd><code>{config.gateway.host}</code></dd></div>
          <div><dt>Port</dt><dd>{config.gateway.port}</dd></div>
          <div><dt>Log-Level</dt><dd>{config.gateway.logLevel}</dd></div>
          <div><dt>CORS</dt><dd>{config.gateway.cors ? "Aktiviert" : "Deaktiviert"}</dd></div>
        </dl>
      </section>

      <section class="setting-card">
        <div class="card-icon">⇄</div>
        <div class="card-head"><div><span>Account-Auswahl</span><h3>Routing</h3></div></div>
        <dl>
          <div><dt>Strategie</dt><dd>{config.selectionStrategy}</dd></div>
          <div><dt>Standard-Priorität</dt><dd>{config.defaultPriority}</dd></div>
          <div><dt>Modellcache</dt><dd>{config.modelsCacheTTL}s TTL</dd></div>
        </dl>
      </section>

      <section class="setting-card">
        <div class="card-icon">▣</div>
        <div class="card-head"><div><span>Web-Konsole</span><h3>{config.ui.enabled ? "Aktiviert" : "Deaktiviert"}</h3></div><span class:enabled={config.ui.enabled} class="status">{config.ui.enabled ? "Online" : "Aus"}</span></div>
        <dl>
          <div><dt>Status</dt><dd>{config.ui.enabled ? "Aktiviert" : "Deaktiviert"}</dd></div>
          <div><dt>Port</dt><dd>{config.ui.enabled ? config.ui.port : "–"}</dd></div>
        </dl>
      </section>

      <section class="setting-card">
        <div class="card-icon">◎</div>
        <div class="card-head"><div><span>Proxy</span><h3>{config.proxy && Object.values(config.proxy).some(Boolean) ? "Konfiguriert" : "Nicht gesetzt"}</h3></div></div>
        {#if config.proxy && Object.values(config.proxy).some(Boolean)}
          <div class="proxy-list">
            {#each Object.entries(config.proxy) as [scope, proxy]}
              {#if proxy}
                <div><span>{scope}</span><code>{proxy.protocol}://{proxy.host}:{proxy.port}</code></div>
              {/if}
            {/each}
          </div>
        {:else}
          <p class="muted">Direkte Verbindungen ohne Proxy.</p>
        {/if}
      </section>
    </div>

    <section class="config-file">
      <div>
        <span class="eyebrow">Konfigurationsdatei</span>
        <h3>Änderungen lokal vornehmen</h3>
        <p>Die Web-Konsole zeigt nur redigierte Werte. Änderungen erfolgen weiterhin in der lokalen JSON-Datei.</p>
      </div>
      <button onclick={copyConfigPath}><code>~/.config/zero-token/config.json</code><span>{copied ? "Kopiert" : "Pfad kopieren"}</span></button>
    </section>

    <div class="security-note"><strong>Sensible Werte geschützt</strong><span>Proxy-Passwörter, Cookies und Tokens werden von der Admin-API redigiert oder vollständig ausgelassen.</span></div>
  {/if}
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .header { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; margin-bottom: 1rem; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.65rem, 4vw, 2.35rem); }
  .header p { margin: 0.55rem 0 0; color: var(--muted); line-height: 1.55; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; }
  .setting-card { min-height: 230px; padding: 1.05rem; border: 1px solid var(--border); border-radius: 16px; background: var(--card-bg); }
  .setting-card.featured { background: linear-gradient(145deg, rgba(124,108,242,0.15), rgba(19,28,46,0.82)); }
  .card-icon { display: grid; place-items: center; width: 36px; height: 36px; margin-bottom: 0.8rem; border-radius: 10px; background: rgba(124,108,242,0.13); color: var(--accent-secondary); }
  .card-head { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
  .card-head span { color: var(--muted); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; }
  .card-head h3 { margin: 0.25rem 0 0; font-size: 1rem; }
  .card-head .status { padding: 0.2rem 0.48rem; border-radius: 999px; background: rgba(145,160,184,0.1); color: var(--muted); font-size: 0.62rem; }
  .card-head .status.enabled, .featured .status { color: var(--success); background: rgba(67,217,163,0.1); }
  dl { display: grid; gap: 0; margin: 0.9rem 0 0; }
  dl div { display: flex; justify-content: space-between; gap: 1rem; padding: 0.55rem 0; border-top: 1px solid var(--border); }
  dt { color: var(--muted); font-size: 0.72rem; }
  dd { margin: 0; text-align: right; font-size: 0.75rem; }
  .proxy-list { display: grid; gap: 0.5rem; margin-top: 0.9rem; }
  .proxy-list div { display: grid; gap: 0.2rem; padding: 0.55rem; border: 1px solid var(--border); border-radius: 9px; background: rgba(5,9,17,0.35); }
  .proxy-list span { color: var(--muted); font-size: 0.66rem; text-transform: capitalize; }
  .proxy-list code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e6; }
  .config-file { display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; margin-top: 0.8rem; padding: 1.1rem; border: 1px solid var(--border); border-radius: 16px; background: rgba(255,255,255,0.018); }
  .config-file h3 { margin: 0.28rem 0 0; font-size: 1rem; }
  .config-file p { max-width: 650px; margin: 0.4rem 0 0; color: var(--muted); line-height: 1.5; font-size: 0.78rem; }
  .config-file button { display: grid; gap: 0.3rem; min-width: 270px; padding: 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(5,9,17,0.45); color: var(--muted); cursor: pointer; text-align: left; }
  .config-file button code { color: #cbd5e6; }
  .config-file button span { font-size: 0.66rem; }
  .security-note, .state-card { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.8rem; padding: 0.9rem 1rem; border: 1px dashed var(--border); border-radius: 13px; color: var(--muted); font-size: 0.76rem; }
  .security-note strong, .state-card strong { color: var(--text); }
  .state-card { display: grid; justify-items: start; }
  .skeleton { height: 230px; border-radius: 16px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (max-width: 760px) { .header { align-items: stretch; flex-direction: column; } .settings-grid { grid-template-columns: 1fr; } .config-file { align-items: stretch; flex-direction: column; } .config-file button { width: 100%; min-width: 0; } }
</style>
