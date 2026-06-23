<script lang="ts">
  import { onMount } from "svelte";
  import {
    connectLiveLogs,
    type LiveLogEvent,
    type LiveLogLevel,
  } from "../lib/live-logs";

  const levelOrder: Record<LiveLogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
  };

  let logs = $state<LiveLogEvent[]>([]);
  let pending = $state<LiveLogEvent[]>([]);
  let state = $state<"connecting" | "open" | "error">("connecting");
  let paused = $state(false);
  let query = $state("");
  let minLevel = $state<LiveLogLevel>("trace");
  let follow = $state(true);
  let viewport = $state<HTMLDivElement | null>(null);

  const filtered = $derived(
    logs.filter((entry) => {
      if (levelOrder[entry.level] < levelOrder[minLevel]) return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return [
        entry.level,
        entry.name ?? "",
        entry.message,
        entry.context ? JSON.stringify(entry.context) : "",
      ].some((value) => value.toLowerCase().includes(needle));
    }),
  );

  $effect(() => {
    const count = filtered.length;
    if (count && follow && viewport) {
      requestAnimationFrame(() => {
        if (viewport) viewport.scrollTop = viewport.scrollHeight;
      });
    }
  });

  onMount(() =>
    connectLiveLogs(
      (entry) => {
        if (paused) {
          pending = [...pending.slice(-499), entry];
          return;
        }
        logs = [...logs.slice(-499), entry];
      },
      (next) => (state = next),
      150,
    ),
  );

  function togglePause() {
    paused = !paused;
    if (!paused && pending.length) {
      logs = [...logs, ...pending].slice(-500);
      pending = [];
    }
  }

  function clearView() {
    logs = [];
    pending = [];
  }

  function formatTime(value: string) {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    }).format(new Date(value));
  }
</script>

<div class="page">
  <section class="header">
    <div>
      <span class="eyebrow">Observability</span>
      <h2>Live-Logs</h2>
      <p>Redigierte Gateway-, Provider-, Modell- und Agent-Ereignisse in Echtzeit.</p>
    </div>
    <div class="stream-state state-{state}">
      <span></span>
      {state === "open" ? "Live verbunden" : state === "connecting" ? "Verbindung …" : "Verbindung unterbrochen"}
    </div>
  </section>

  <section class="toolbar" aria-label="Log-Steuerung">
    <label class="search">
      <span>⌕</span>
      <input bind:value={query} placeholder="Logs durchsuchen" aria-label="Logs durchsuchen" />
    </label>
    <select bind:value={minLevel} aria-label="Mindest-Loglevel">
      <option value="trace">Trace+</option>
      <option value="debug">Debug+</option>
      <option value="info">Info+</option>
      <option value="warn">Warn+</option>
      <option value="error">Error+</option>
      <option value="fatal">Fatal</option>
    </select>
    <label class="follow">
      <input type="checkbox" bind:checked={follow} />
      Auto-Scroll
    </label>
    <button class:active={paused} class="control" onclick={togglePause}>
      {paused ? `Fortsetzen${pending.length ? ` (${pending.length})` : ""}` : "Pausieren"}
    </button>
    <button class="control" onclick={clearView}>Ansicht leeren</button>
  </section>

  <div class="summary">
    <span>{filtered.length} sichtbar</span>
    <span>{logs.length} im Browser</span>
    <span>Serverpuffer: maximal 500</span>
  </div>

  <section class="terminal" bind:this={viewport} aria-live="polite">
    {#if filtered.length === 0}
      <div class="empty">
        <strong>Keine passenden Logeinträge</strong>
        <span>Starte das Gateway oder ändere Filter und Suche.</span>
      </div>
    {:else}
      {#each filtered as entry (entry.id)}
        <article class="log-row level-{entry.level}">
          <time>{formatTime(entry.time)}</time>
          <span class="level">{entry.level}</span>
          <span class="source">{entry.name ?? "nova"}</span>
          <div class="content">
            <span class="message">{entry.message || "(ohne Nachricht)"}</span>
            {#if entry.context}
              <code>{JSON.stringify(entry.context)}</code>
            {/if}
          </div>
        </article>
      {/each}
    {/if}
  </section>

  <div class="security-note">
    <strong>Redigierte Ausgabe</strong>
    <span>Cookies, Zugriffstokens und Authorization-/Cookie-Header werden vor dem Live-Stream durch Pino entfernt.</span>
  </div>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .header { display: flex; justify-content: space-between; align-items: end; gap: 1rem; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.65rem, 4vw, 2.35rem); }
  .header p { margin: 0.55rem 0 0; color: var(--muted); line-height: 1.55; }
  .stream-state { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.7rem; border: 1px solid var(--border); border-radius: 999px; color: var(--muted); font-size: 0.7rem; }
  .stream-state span { width: 8px; height: 8px; border-radius: 50%; background: #758198; }
  .state-open span { background: var(--success); box-shadow: 0 0 0 4px rgba(67,217,163,0.1); }
  .state-error span { background: var(--danger); box-shadow: 0 0 0 4px rgba(255,111,133,0.1); }
  .toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 130px auto auto auto; gap: 0.65rem; align-items: center; margin: 1rem 0 0.65rem; }
  .search { display: flex; align-items: center; gap: 0.5rem; min-height: 42px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  .search input { width: 100%; border: 0; outline: 0; background: transparent; color: var(--text); }
  select, .control { min-height: 42px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); padding: 0 0.75rem; }
  .control { cursor: pointer; }
  .control.active { color: #ffd166; border-color: rgba(255,209,102,0.38); background: rgba(255,209,102,0.08); }
  .follow { display: inline-flex; align-items: center; gap: 0.45rem; color: var(--muted); font-size: 0.72rem; white-space: nowrap; }
  .summary { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.55rem; color: var(--muted); font-size: 0.68rem; }
  .terminal { height: min(66vh, 720px); overflow: auto; border: 1px solid var(--border); border-radius: 14px; background: #060a12; box-shadow: inset 0 1px 0 rgba(255,255,255,0.02); }
  .log-row { display: grid; grid-template-columns: 94px 54px 100px minmax(0, 1fr); gap: 0.65rem; align-items: start; padding: 0.5rem 0.7rem; border-bottom: 1px solid rgba(151,166,196,0.08); font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.72rem; }
  .log-row:hover { background: rgba(255,255,255,0.025); }
  time, .source { color: #66758d; }
  .level { font-weight: 800; text-transform: uppercase; color: #9ca9be; }
  .level-info .level { color: #67a7ff; }
  .level-warn .level { color: #ffd166; }
  .level-error .level, .level-fatal .level { color: #ff7187; }
  .level-debug .level { color: #b197fc; }
  .content { min-width: 0; }
  .message { color: #dce4f1; overflow-wrap: anywhere; }
  .content code { display: block; margin-top: 0.25rem; color: #78879f; white-space: pre-wrap; overflow-wrap: anywhere; }
  .empty { display: grid; place-content: center; justify-items: center; gap: 0.4rem; min-height: 100%; color: var(--muted); text-align: center; }
  .empty strong { color: var(--text); }
  .security-note { display: flex; flex-wrap: wrap; gap: 0.55rem; margin-top: 0.75rem; padding: 0.8rem 0.9rem; border: 1px dashed var(--border); border-radius: 12px; color: var(--muted); font-size: 0.72rem; }
  .security-note strong { color: var(--text); }
  @media (max-width: 980px) { .toolbar { grid-template-columns: 1fr 130px auto; } .toolbar .control { grid-row: 2; } .log-row { grid-template-columns: 86px 52px minmax(0,1fr); } .source { display: none; } }
  @media (max-width: 640px) { .header { align-items: flex-start; flex-direction: column; } .toolbar { grid-template-columns: 1fr 1fr; } .search { grid-column: 1 / -1; } .follow { grid-column: 1 / -1; } .terminal { height: 62vh; } .log-row { grid-template-columns: 76px 48px minmax(0,1fr); gap: 0.4rem; padding: 0.45rem; font-size: 0.65rem; } }
</style>
