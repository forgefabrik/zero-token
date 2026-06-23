<script lang="ts">
  import {
    AGENT_BACKEND_NAME,
    AGENT_SOURCE_URL,
    APP_NAME,
  } from "../lib/brand";

  let gatewayOnline = $state<boolean | null>(null);
  let copied = $state<string | null>(null);

  const steps = [
    {
      id: "install",
      title: "Agent installieren",
      description: "Installiert das MIT-lizenzierte yoyo-agent Binary über Cargo.",
      command: "nova agent install",
    },
    {
      id: "init",
      title: "Projekt vorbereiten",
      description: "Erzeugt eine lokale .yoyo.toml und sichere Nova-Anweisungen.",
      command: "nova agent init",
    },
    {
      id: "doctor",
      title: "Integration prüfen",
      description: "Prüft Binary, Version und Erreichbarkeit des lokalen Gateways.",
      command: "nova agent doctor",
    },
    {
      id: "run",
      title: "Agent starten",
      description: "Startet den Coding-Agent gegen Novas OpenAI-kompatibles Gateway.",
      command: "nova agent --model gpt-4o",
    },
  ];

  $effect(() => {
    void checkGateway();
  });

  async function checkGateway() {
    gatewayOnline = null;
    try {
      const response = await fetch("/health", { cache: "no-store" });
      gatewayOnline = response.ok;
    } catch {
      gatewayOnline = false;
    }
  }

  async function copyCommand(id: string, command: string) {
    await navigator.clipboard.writeText(command);
    copied = id;
    window.setTimeout(() => {
      if (copied === id) copied = null;
    }, 1600);
  }
</script>

<div class="page">
  <section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">Coding Agent</span>
      <h2>{APP_NAME} Agent</h2>
      <p>
        Nutzt <strong>{AGENT_BACKEND_NAME}</strong> als optionales Terminal-Backend und routet
        Modellzugriffe über das lokale Nova-Gateway.
      </p>
      <div class="status-line">
        <span class:online={gatewayOnline === true} class:offline={gatewayOnline === false} class="dot"></span>
        <span>{gatewayOnline === null ? "Gateway wird geprüft" : gatewayOnline ? "Gateway ist bereit" : "Gateway ist nicht erreichbar"}</span>
        <button onclick={checkGateway}>Neu prüfen</button>
      </div>
    </div>
    <div class="agent-mark">N</div>
  </section>

  <section class="architecture">
    <div><span>Terminal</span><strong>nova agent</strong></div>
    <i>→</i>
    <div><span>Agent-Backend</span><strong>{AGENT_BACKEND_NAME}</strong></div>
    <i>→</i>
    <div><span>Model API</span><strong>Nova /v1</strong></div>
  </section>

  <div class="steps">
    {#each steps as step, index}
      <article>
        <div class="step-number">{index + 1}</div>
        <div class="step-copy">
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>
        <button class="command" onclick={() => copyCommand(step.id, step.command)}>
          <code>{step.command}</code>
          <span>{copied === step.id ? "Kopiert" : "Kopieren"}</span>
        </button>
      </article>
    {/each}
  </div>

  <section class="details-grid">
    <div class="detail-card">
      <span class="eyebrow">Konfiguration</span>
      <h3>Lokaler Custom Provider</h3>
      <p>
        Nova startet das Backend mit <code>--provider custom</code> und setzt die lokale
        Gateway-URL automatisch auf <code>http://127.0.0.1:3000/v1</code>.
      </p>
    </div>
    <div class="detail-card">
      <span class="eyebrow">Sicherheit</span>
      <h3>Keine Browser-Secrets im Agent</h3>
      <p>
        Der Agent spricht ausschließlich mit Nova. Cookies, Sessiontokens und Account-Dateien
        werden nicht an das Agent-Backend übergeben.
      </p>
    </div>
    <div class="detail-card">
      <span class="eyebrow">Kompatibilität</span>
      <h3>Eigenständiges Backend</h3>
      <p>
        {AGENT_BACKEND_NAME} bleibt ein separates Open-Source-Projekt. Nova integriert das
        installierte Binary, statt dessen Quellbaum zu duplizieren.
      </p>
    </div>
  </section>

  <section class="source-note">
    <div>
      <strong>Open-Source-Attribution</strong>
      <span>{AGENT_BACKEND_NAME} · MIT License · Copyright © 2026 yologdev</span>
    </div>
    <a href={AGENT_SOURCE_URL} target="_blank" rel="noreferrer">Quellprojekt öffnen ↗</a>
  </section>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; align-items: center; gap: 2rem; padding: clamp(1.3rem, 3vw, 2rem); border: 1px solid var(--border); border-radius: 20px; background: radial-gradient(circle at 90% 10%, rgba(67,217,163,0.14), transparent 30%), linear-gradient(135deg, rgba(124,108,242,0.2), rgba(19,28,46,0.78)); }
  .hero-copy { max-width: 760px; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.4rem 0 0; font-size: clamp(1.8rem, 5vw, 3rem); letter-spacing: -0.04em; }
  .hero p { margin: 0.7rem 0 0; color: var(--muted); line-height: 1.65; }
  .hero p strong { color: var(--text); }
  .agent-mark { display: grid; place-items: center; width: 96px; height: 96px; flex: 0 0 auto; border-radius: 28px; background: linear-gradient(145deg, #8f7aff, #43d9a3); box-shadow: 0 18px 50px rgba(79,110,247,0.25); font-size: 2.2rem; font-weight: 900; }
  .status-line { display: flex; align-items: center; gap: 0.55rem; margin-top: 1rem; color: var(--muted); font-size: 0.76rem; }
  .status-line button { margin-left: 0.25rem; border: 0; background: transparent; color: var(--accent-secondary); cursor: pointer; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: #65748e; }
  .dot.online { background: var(--success); }
  .dot.offline { background: var(--danger); }
  .architecture { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 0.7rem; align-items: center; margin: 1rem 0; }
  .architecture div { padding: 0.9rem; border: 1px solid var(--border); border-radius: 13px; background: var(--card-bg); }
  .architecture span, .architecture strong { display: block; }
  .architecture span { color: var(--muted); font-size: 0.68rem; }
  .architecture strong { margin-top: 0.25rem; font-size: 0.82rem; }
  .architecture i { color: var(--accent-secondary); font-style: normal; }
  .steps { display: grid; gap: 0.75rem; }
  .steps article { display: grid; grid-template-columns: auto minmax(180px, 1fr) minmax(300px, 0.9fr); gap: 0.9rem; align-items: center; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); }
  .step-number { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: rgba(124,108,242,0.14); color: var(--accent-secondary); font-weight: 800; }
  h3 { margin: 0; font-size: 0.95rem; }
  .step-copy p, .detail-card p { margin: 0.3rem 0 0; color: var(--muted); line-height: 1.5; font-size: 0.77rem; }
  .command { display: flex; align-items: center; gap: 0.6rem; width: 100%; min-width: 0; padding: 0.65rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(5,9,17,0.5); color: var(--muted); cursor: pointer; text-align: left; }
  .command code { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #d5dcef; }
  .command span { font-size: 0.66rem; }
  .details-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-top: 1rem; }
  .detail-card { padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: rgba(255,255,255,0.018); }
  .detail-card h3 { margin-top: 0.35rem; }
  .detail-card code { color: #d5dcef; }
  .source-note { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; padding: 0.9rem 1rem; border: 1px dashed var(--border); border-radius: 13px; color: var(--muted); }
  .source-note strong, .source-note span { display: block; }
  .source-note strong { color: var(--text); font-size: 0.78rem; }
  .source-note span { margin-top: 0.2rem; font-size: 0.68rem; }
  .source-note a { color: var(--accent-secondary); font-size: 0.75rem; text-decoration: none; }
  @media (max-width: 880px) { .steps article { grid-template-columns: auto 1fr; } .command { grid-column: 1 / -1; } .details-grid { grid-template-columns: 1fr; } }
  @media (max-width: 640px) { .agent-mark { display: none; } .architecture { grid-template-columns: 1fr; } .architecture i { transform: rotate(90deg); text-align: center; } .source-note { align-items: flex-start; flex-direction: column; } }
</style>
