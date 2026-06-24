<script lang="ts">
  import { onMount } from "svelte";
  import DiscoveryControlPanel from "./DiscoveryControlPanel.svelte";
  import DiscoveryReviewQueue from "./DiscoveryReviewQueue.svelte";
  import {
    getDiscoveryControl,
    runDiscoveryControl,
    saveDiscoveryControl,
    type DiscoveryControlState,
  } from "../lib/discovery-control";

  let state = $state<DiscoveryControlState | null>(null);
  let loading = $state(true);
  let busy = $state(false);
  let error = $state<string | null>(null);

  const valuable = $derived(state?.reviews.filter((item) => item.valuable).length ?? 0);
  const accounts = $derived(
    state?.reviews.filter((item) => item.valuable && item.accountRequired).length ?? 0,
  );
  const streams = $derived(state?.reviews.filter((item) => item.streamPotential).length ?? 0);

  onMount(() => {
    void load();
    const timer = window.setInterval(() => {
      if (state?.running || busy) void refresh(false);
    }, 3000);
    return () => window.clearInterval(timer);
  });

  async function load() {
    loading = true;
    await refresh(true);
    loading = false;
  }

  async function refresh(showError = true) {
    try {
      state = await getDiscoveryControl();
      error = null;
    } catch (reason) {
      if (showError) {
        error = reason instanceof Error ? reason.message : "Control Center nicht erreichbar";
      }
    }
  }

  async function run() {
    busy = true;
    try {
      state = await runDiscoveryControl();
      error = null;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Discovery fehlgeschlagen";
    } finally {
      busy = false;
    }
  }

  async function save(config: DiscoveryControlState["config"]) {
    state = await saveDiscoveryControl(config);
  }
</script>

<div class="page">
  <section class="hero">
    <div>
      <span>Autonomous Discovery</span>
      <h2>Nova Control Center</h2>
      <p>
        Öffentliche LLM-Webquellen finden, bewerten und mit einem sichtbaren Browser auf echte
        API- und Streamsignale prüfen.
      </p>
    </div>
    <b class:online={state?.config.enabled}>
      {state?.config.enabled ? "Automatik aktiv" : "Automatik pausiert"}
    </b>
  </section>

  {#if error}
    <div class="notice"><strong>Fehler</strong><span>{error}</span><button onclick={load}>Neu laden</button></div>
  {/if}
  {#if state?.lastError}
    <div class="notice warning"><strong>Letzter Lauf</strong><span>{state.lastError}</span></div>
  {/if}

  <section class="stats">
    <article><span>Kandidaten</span><strong>{state?.reviews.length ?? 0}</strong></article>
    <article><span>Lohnenswert</span><strong>{valuable}</strong></article>
    <article><span>Account nötig</span><strong>{accounts}</strong></article>
    <article><span>HTML-Stream-Signale</span><strong>{streams}</strong></article>
  </section>

  {#if loading || !state}
    <div class="loading">Control Center wird geladen …</div>
  {:else}
    <div class="control">
      <DiscoveryControlPanel {state} {busy} onRun={run} onSave={save} />
      <section class="pipeline">
        <span>Freigabepipeline</span>
        <h3>Von der Website zur API</h3>
        <ol>
          <li><i>1</i><div><strong>Quelle finden</strong><small>Katalog oder öffentlicher Kandidat</small></div></li>
          <li><i>2</i><div><strong>Webseite prüfen</strong><small>Login-, API- und HTML-Signale</small></div></li>
          <li><i>3</i><div><strong>Sichtbar testen</strong><small>Du sendest selbst eine Testnachricht</small></div></li>
          <li><i>4</i><div><strong>Adapter bauen</strong><small>Echte Endpunkte und Streamingformat</small></div></li>
          <li><i>5</i><div><strong>API aktivieren</strong><small>Erst nach drei erfolgreichen Läufen</small></div></li>
        </ol>
        <p>
          <strong>Datensparsam.</strong> Die Probe speichert nur Methode, bereinigten URL-Pfad,
          Ressourcentyp, Status und Content-Type.
        </p>
      </section>
    </div>

    <DiscoveryReviewQueue reviews={state.reviews} onChanged={refresh} />
  {/if}

  <footer>
    Ein beobachtetes Streamsignal ist noch kein aktiver Provider. Die Freigabe erfolgt erst nach
    einem reproduzierbaren Adaptertest.
  </footer>
</div>

<style>
  .page { padding: .5rem 0 2rem; }
  .hero { display:flex; justify-content:space-between; align-items:end; gap:1rem; padding:1.4rem; border:1px solid var(--border); border-radius:18px; background:linear-gradient(135deg,rgba(124,108,242,.2),rgba(19,28,46,.8)); }
  .hero span,.pipeline>span { color:var(--accent-secondary); text-transform:uppercase; letter-spacing:.12em; font-size:.68rem; font-weight:700; }
  h2 { margin:.35rem 0 0; font-size:clamp(1.8rem,4vw,2.6rem); }
  .hero p { max-width:720px; margin:.55rem 0 0; color:var(--muted); line-height:1.55; }
  .hero b { color:var(--muted); font-size:.72rem; white-space:nowrap; }
  .hero b.online { color:var(--success); }
  .notice,.loading,footer { display:flex; gap:.55rem; margin-top:.8rem; padding:.85rem; border:1px dashed var(--border); border-radius:12px; color:var(--muted); font-size:.72rem; }
  .notice button { margin-left:auto; border:0; background:transparent; color:var(--accent-secondary); cursor:pointer; }
  .notice.warning { color:#ffd166; border-color:rgba(255,209,102,.3); }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:.7rem; margin:.8rem 0; }
  .stats article { padding:.85rem 1rem; border:1px solid var(--border); border-radius:13px; background:var(--card-bg); }
  .stats span,.stats strong { display:block; }
  .stats span { color:var(--muted); font-size:.66rem; text-transform:uppercase; }
  .stats strong { margin-top:.25rem; font-size:1.5rem; }
  .control { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(270px,.7fr); gap:.8rem; }
  .pipeline { padding:1rem; border:1px solid var(--border); border-radius:16px; background:var(--card-bg); }
  h3 { margin:.28rem 0 0; font-size:1rem; }
  ol { display:grid; gap:.6rem; padding:0; list-style:none; }
  li { display:flex; gap:.55rem; }
  li i { display:grid; place-items:center; width:24px; height:24px; flex:0 0 auto; border-radius:7px; background:rgba(124,108,242,.12); color:var(--accent-secondary); font-size:.66rem; font-style:normal; }
  li strong,li small { display:block; }
  li strong { font-size:.7rem; }
  li small { margin-top:.15rem; color:var(--muted); font-size:.63rem; }
  .pipeline p { padding:.65rem; border:1px solid rgba(67,217,163,.18); border-radius:9px; color:var(--muted); font-size:.65rem; line-height:1.45; }
  footer { line-height:1.5; }
  @media(max-width:900px){.control{grid-template-columns:1fr}.stats{grid-template-columns:repeat(2,1fr)}}
  @media(max-width:650px){.hero{align-items:flex-start;flex-direction:column}}
</style>
