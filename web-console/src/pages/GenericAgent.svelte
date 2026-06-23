<script lang="ts">
  let copied = $state<string | null>(null);
  let online = $state<boolean | null>(null);

  const commands = [
    { id: "home", label: "Repository-Pfad setzen", value: "export NOVA_GENERIC_AGENT_HOME=/pfad/zu/genericagent" },
    { id: "init", label: "Nova-Konfiguration erstellen", value: "nova-ga init --model gpt-4o" },
    { id: "doctor", label: "Integration prüfen", value: "nova-ga doctor" },
    { id: "run", label: "CLI starten", value: "nova-ga run --frontend=cli" },
    { id: "tui", label: "TUI starten", value: "nova-ga run --frontend=tui" },
  ];

  $effect(() => {
    void checkGateway();
  });

  async function checkGateway() {
    online = null;
    try {
      online = (await fetch("/health", { cache: "no-store" })).ok;
    } catch {
      online = false;
    }
  }

  async function copy(id: string, value: string) {
    await navigator.clipboard.writeText(value);
    copied = id;
    window.setTimeout(() => {
      if (copied === id) copied = null;
    }, 1500);
  }
</script>

<div class="page">
  <section class="hero">
    <div>
      <span class="eyebrow">Optionales Backend</span>
      <h2>Nova + GenericAgent</h2>
      <p>
        Nova konfiguriert eine separat installierte GenericAgent-Kopie für den lokalen
        OpenAI-kompatiblen Gateway-Endpunkt. Das Quellprojekt bleibt eigenständig.
      </p>
    </div>
    <div class="status">
      <span class:online={online === true} class:offline={online === false}></span>
      {online === null ? "Prüfe Gateway" : online ? "Gateway bereit" : "Gateway offline"}
    </div>
  </section>

  <section class="flow">
    <div><small>1</small><strong>GenericAgent separat installieren</strong></div>
    <i>→</i>
    <div><small>2</small><strong>Nova-Konfiguration erzeugen</strong></div>
    <i>→</i>
    <div><small>3</small><strong>Frontend explizit starten</strong></div>
  </section>

  <div class="commands">
    {#each commands as command}
      <article>
        <div>
          <h3>{command.label}</h3>
          <code>{command.value}</code>
        </div>
        <button onclick={() => copy(command.id, command.value)}>
          {copied === command.id ? "Kopiert" : "Kopieren"}
        </button>
      </article>
    {/each}
  </div>

  <section class="features">
    <div><strong>Konfiguration</strong><span>mykey.py zeigt auf Novas lokalen /v1-Endpunkt.</span></div>
    <div><strong>Frontends</strong><span>CLI, TUI, TUI2, GUI, Launch und Hub sind auswählbar.</span></div>
    <div><strong>Isolation</strong><span>Nova übergibt keine Cookies oder Browser-Sitzungen an das Backend.</span></div>
  </section>

  <section class="notice">
    <div>
      <strong>Open-Source-Attribution</strong>
      <span>GenericAgent · MIT License · Copyright © 2025 lsdefine</span>
    </div>
    <a href="https://github.com/lsdefine/genericagent" target="_blank" rel="noreferrer">Repository öffnen ↗</a>
  </section>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; padding: 1.5rem; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(135deg, rgba(124,108,242,0.18), rgba(67,217,163,0.08)); }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.7rem, 4vw, 2.5rem); }
  .hero p { max-width: 720px; margin: 0.55rem 0 0; color: var(--muted); line-height: 1.6; }
  .status { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--muted); font-size: 0.72rem; white-space: nowrap; }
  .status span { width: 8px; height: 8px; border-radius: 50%; background: #748096; }
  .status span.online { background: var(--success); }
  .status span.offline { background: var(--danger); }
  .flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; gap: 0.65rem; align-items: center; margin: 0.9rem 0; }
  .flow div { display: flex; gap: 0.55rem; align-items: center; padding: 0.85rem; border: 1px solid var(--border); border-radius: 12px; background: var(--card-bg); }
  .flow small { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 7px; background: rgba(124,108,242,0.13); color: var(--accent-secondary); }
  .flow strong { font-size: 0.76rem; }
  .flow i { color: var(--accent-secondary); font-style: normal; }
  .commands { display: grid; gap: 0.65rem; }
  .commands article { display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1rem; border: 1px solid var(--border); border-radius: 13px; background: var(--card-bg); }
  .commands article > div { min-width: 0; flex: 1; }
  h3 { margin: 0 0 0.3rem; font-size: 0.82rem; }
  .commands code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cfd8ea; }
  .commands button { min-height: 36px; padding: 0 0.7rem; border: 1px solid var(--border); border-radius: 9px; background: rgba(124,108,242,0.12); color: var(--text); cursor: pointer; }
  .features { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.65rem; margin-top: 0.9rem; }
  .features div { padding: 0.9rem; border: 1px solid var(--border); border-radius: 13px; background: rgba(255,255,255,0.018); }
  .features strong, .features span { display: block; }
  .features strong { font-size: 0.78rem; }
  .features span { margin-top: 0.3rem; color: var(--muted); font-size: 0.72rem; line-height: 1.5; }
  .notice { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 0.9rem; padding: 0.85rem 0.95rem; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); }
  .notice strong, .notice span { display: block; }
  .notice strong { color: var(--text); font-size: 0.76rem; }
  .notice span { margin-top: 0.2rem; font-size: 0.68rem; }
  .notice a { color: var(--accent-secondary); font-size: 0.72rem; text-decoration: none; }
  @media (max-width: 760px) { .hero { align-items: flex-start; flex-direction: column; } .flow { grid-template-columns: 1fr; } .flow i { transform: rotate(90deg); text-align: center; } .features { grid-template-columns: 1fr; } .commands article { align-items: stretch; flex-direction: column; } .notice { align-items: flex-start; flex-direction: column; } }
</style>
