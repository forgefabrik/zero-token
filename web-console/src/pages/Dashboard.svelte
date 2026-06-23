<script lang="ts">
  import { getConfig, getHealth, getStatus } from "../lib/api";

  let status = $state<{ accounts: number; validSessions: number; models: number; timestamp: string } | null>(null);
  let health = $state<{ status: string } | null>(null);
  let config = $state<{ gateway: { host: string; port: number } } | null>(null);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let copied = $state<string | null>(null);

  const baseUrl = $derived(config ? `http://${config.gateway.host}:${config.gateway.port}` : "http://127.0.0.1:3000");
  const sessionRatio = $derived(status?.accounts ? Math.round((status.validSessions / status.accounts) * 100) : 0);

  $effect(() => {
    void load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      const [systemStatus, gatewayHealth, appConfig] = await Promise.all([
        getStatus(),
        getHealth(),
        getConfig(),
      ]);
      status = systemStatus;
      health = gatewayHealth;
      config = appConfig;
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    copied = key;
    window.setTimeout(() => {
      if (copied === key) copied = null;
    }, 1500);
  }
</script>

<div class="page">
  <section class="hero">
    <div>
      <span class="eyebrow">Local AI Gateway</span>
      <h2>Alles bereit für lokale Inference.</h2>
      <p>Accounts, Modelle und Gateway-Zustand auf einen Blick – ohne sensible Sessiondaten im Browser offenzulegen.</p>
    </div>
    <button class="btn" onclick={load} disabled={loading}>{loading ? "Prüfe …" : "Status aktualisieren"}</button>
  </section>

  {#if loading}
    <div class="stats">{#each Array(4) as _}<div class="skeleton"></div>{/each}</div>
  {:else if error}
    <div class="offline-card">
      <div class="offline-icon">!</div>
      <div><strong>Gateway nicht erreichbar</strong><span>{error}</span></div>
      <button class="btn" onclick={load}>Erneut versuchen</button>
    </div>
  {:else}
    <div class="stats">
      <article><span>Accounts</span><strong>{status?.accounts ?? 0}</strong><small>{status?.validSessions ?? 0} aktive Sessions</small></article>
      <article><span>Session Health</span><strong>{sessionRatio}%</strong><small>{sessionRatio === 100 ? "Alle Sessions gültig" : "Prüfung empfohlen"}</small></article>
      <article><span>Modelle</span><strong>{status?.models ?? 0}</strong><small>im lokalen Cache</small></article>
      <article><span>Gateway</span><strong class:healthy={health?.status === "ok"}>{health?.status === "ok" ? "Online" : "Offline"}</strong><small>{baseUrl}</small></article>
    </div>

    <div class="dashboard-grid">
      <section class="panel endpoints">
        <div class="panel-head"><div><span class="eyebrow">API</span><h3>OpenAI-kompatible Endpunkte</h3></div><span class="live"><i></i> lokal</span></div>
        {#each [
          ["Models", `${baseUrl}/v1/models`, "GET"],
          ["Chat Completions", `${baseUrl}/v1/chat/completions`, "POST"],
          ["Responses", `${baseUrl}/v1/responses`, "POST"],
        ] as endpoint}
          <button class="endpoint" onclick={() => copy(endpoint[1], endpoint[0])}>
            <span class="method">{endpoint[2]}</span>
            <span class="endpoint-copy"><strong>{endpoint[0]}</strong><code>{endpoint[1]}</code></span>
            <span>{copied === endpoint[0] ? "Kopiert" : "Kopieren"}</span>
          </button>
        {/each}
      </section>

      <section class="panel setup">
        <div><span class="eyebrow">Schnellstart</span><h3>Provider verbinden</h3></div>
        <ol>
          <li><span>1</span><div><strong>Provider wählen</strong><small>Öffne die Provider-Seite und kopiere den Login-Befehl.</small></div></li>
          <li><span>2</span><div><strong>Browser-Login abschließen</strong><small>Die Session wird ausschließlich lokal gespeichert.</small></div></li>
          <li><span>3</span><div><strong>Modelle aktualisieren</strong><small>Danach steht der lokale Gateway-Endpunkt bereit.</small></div></li>
        </ol>
        <button class="command" onclick={() => copy("zt providers list", "providers")}><code>zt providers list</code><span>{copied === "providers" ? "Kopiert" : "Kopieren"}</span></button>
      </section>
    </div>

    <div class="footer-line">
      <span>Letzte Statusprüfung</span>
      <strong>{status?.timestamp ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(status.timestamp)) : "–"}</strong>
    </div>
  {/if}
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; padding: 1.6rem; border: 1px solid var(--border); border-radius: 18px; background: radial-gradient(circle at 90% 0%, rgba(67,217,163,0.12), transparent 30%), linear-gradient(135deg, rgba(124,108,242,0.17), rgba(19,28,46,0.68)); }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.4rem 0 0; max-width: 720px; font-size: clamp(1.8rem, 4vw, 2.7rem); letter-spacing: -0.035em; }
  .hero p { max-width: 720px; margin: 0.65rem 0 0; color: var(--muted); line-height: 1.6; }
  .stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.8rem; margin: 1rem 0; }
  .stats article { min-height: 132px; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); }
  .stats article > span, .stats small { display: block; color: var(--muted); }
  .stats article > span { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; }
  .stats strong { display: block; margin-top: 0.45rem; font-size: 1.9rem; letter-spacing: -0.03em; }
  .stats strong.healthy { color: var(--success); }
  .stats small { margin-top: 0.35rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.7rem; }
  .dashboard-grid { display: grid; grid-template-columns: 1.3fr 0.9fr; gap: 0.8rem; }
  .panel { padding: 1.1rem; border: 1px solid var(--border); border-radius: 16px; background: var(--card-bg); }
  .panel h3 { margin: 0.28rem 0 0; font-size: 1rem; }
  .panel-head { display: flex; justify-content: space-between; align-items: start; gap: 1rem; margin-bottom: 0.8rem; }
  .live { display: inline-flex; align-items: center; gap: 0.4rem; color: var(--muted); font-size: 0.68rem; }
  .live i { width: 7px; height: 7px; border-radius: 50%; background: var(--success); }
  .endpoint { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.75rem 0; border: 0; border-top: 1px solid var(--border); background: transparent; color: var(--muted); cursor: pointer; text-align: left; }
  .method { width: 40px; color: var(--accent-secondary); font-size: 0.66rem; font-weight: 700; }
  .endpoint-copy { min-width: 0; flex: 1; }
  .endpoint-copy strong, .endpoint-copy code { display: block; }
  .endpoint-copy strong { color: var(--text); font-size: 0.78rem; }
  .endpoint-copy code { margin-top: 0.18rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  .endpoint > span:last-child { font-size: 0.66rem; }
  ol { display: grid; gap: 0.8rem; margin: 1rem 0; padding: 0; list-style: none; }
  li { display: flex; gap: 0.65rem; align-items: start; }
  li > span { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 auto; border-radius: 8px; background: rgba(124,108,242,0.13); color: var(--accent-secondary); font-size: 0.7rem; }
  li strong, li small { display: block; }
  li strong { font-size: 0.78rem; }
  li small { margin-top: 0.15rem; color: var(--muted); line-height: 1.4; }
  .command { display: flex; justify-content: space-between; gap: 1rem; width: 100%; padding: 0.65rem 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(5,9,17,0.5); color: var(--muted); cursor: pointer; }
  .command code { color: #cbd5e6; }
  .footer-line { display: flex; justify-content: space-between; gap: 1rem; margin-top: 0.8rem; padding: 0.75rem 0.2rem; color: var(--muted); font-size: 0.7rem; }
  .footer-line strong { color: var(--text); font-weight: 500; }
  .offline-card { display: flex; align-items: center; gap: 0.8rem; margin-top: 1rem; padding: 1rem; border: 1px solid rgba(255,111,133,0.25); border-radius: 15px; background: rgba(255,111,133,0.07); }
  .offline-card > div:nth-child(2) { flex: 1; }
  .offline-card strong, .offline-card span { display: block; }
  .offline-card span { margin-top: 0.2rem; color: var(--muted); font-size: 0.75rem; }
  .offline-icon { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: rgba(255,111,133,0.12); color: var(--danger); font-weight: 800; }
  .skeleton { height: 132px; border-radius: 15px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (max-width: 980px) { .stats { grid-template-columns: repeat(2, 1fr); } .dashboard-grid { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .hero { align-items: stretch; flex-direction: column; } .hero .btn { width: 100%; } .stats { grid-template-columns: 1fr 1fr; } .stats article { min-height: 115px; } .footer-line { flex-direction: column; } }
</style>
