<script lang="ts">
  import { onMount } from "svelte";
  import { connectLiveLogs } from "../lib/live-logs";
  import type { LiveLogEvent, LiveLogLevel } from "../lib/live-logs";

  const VISIBLE_LIMIT = 100;
  const order: Record<LiveLogLevel, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };

  let logs = $state<LiveLogEvent[]>([]);
  let pending = $state<LiveLogEvent[]>([]);
  let paused = $state(false);
  let query = $state("");
  let level = $state<LiveLogLevel>("trace");
  let state = $state("connecting");
  let selectedId = $state("");

  const filtered = $derived(logs.filter((row) =>
    order[row.level] >= order[level] &&
    (!query || [row.level, row.name ?? "", row.message, row.context ? JSON.stringify(row.context) : ""].some((value) => value.toLowerCase().includes(query.toLowerCase()))),
  ));
  const visibleRows = $derived(filtered.slice(-VISIBLE_LIMIT).reverse());
  const selected = $derived(logs.find((row) => row.id === selectedId));

  onMount(() => connectLiveLogs(
    (entry) => {
      if (paused) pending = [...pending.slice(-499), entry];
      else logs = [...logs.slice(-499), entry];
    },
    (next) => state = next,
    150,
  ));

  function toggle() {
    paused = !paused;
    if (!paused && pending.length) {
      logs = [...logs, ...pending].slice(-500);
      pending = [];
    }
  }

  function clear() {
    logs = [];
    pending = [];
    selectedId = "";
  }

  const time = (value: string) => new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  }).format(new Date(value));
</script>

<div class="page">
  <header>
    <div><small>EVENT REGISTER</small><h2>Live-Logs</h2><p>{visibleRows.length} von {filtered.length} sichtbar · Verbindung {state}</p></div>
    <div><button onclick={toggle}>{paused ? `Fortsetzen (${pending.length})` : "Pausieren"}</button><button onclick={clear}>Leeren</button></div>
  </header>

  <section class="filters">
    <input bind:value={query} placeholder="Logs durchsuchen …" />
    <select bind:value={level}><option value="trace">Trace+</option><option value="debug">Debug+</option><option value="info">Info+</option><option value="warn">Warn+</option><option value="error">Error+</option><option value="fatal">Fatal</option></select>
  </section>

  <div class="grid">
    <table>
      <thead><tr><th>#</th><th>Zeit</th><th>Level</th><th>Quelle</th><th>Nachricht</th><th>Kontext</th></tr></thead>
      <tbody>
        {#each visibleRows as row, index (row.id)}
          {@const context = row.context ? JSON.stringify(row.context) : "–"}
          <tr class={`level-${row.level}`} class:selected={selectedId === row.id} onclick={() => selectedId = row.id}>
            <td>{index + 1}</td>
            <td>{time(row.time)}</td>
            <td><b>{row.level}</b></td>
            <td title={row.name ?? "nova"}>{row.name ?? "nova"}</td>
            <td title={row.message || "(ohne Nachricht)"}>{row.message || "(ohne Nachricht)"}</td>
            <td title={context}><code>{context}</code></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pager"><span>Neueste {Math.min(VISIBLE_LIMIT, filtered.length)} Einträge · Zeile anklicken für Details</span></div>

  {#if selected}
    <section class="detail">
      <header><b>{selected.level.toUpperCase()} · {selected.name ?? "nova"}</b><button onclick={() => selectedId = ""}>Schließen</button></header>
      <p>{selected.message || "(ohne Nachricht)"}</p>
      <pre>{selected.context ? JSON.stringify(selected.context, null, 2) : "Kein Kontext"}</pre>
    </section>
  {/if}
</div>

<style>
  .page{padding:.25rem 0 1rem}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:.6rem}header small{color:var(--accent-secondary)}h2{margin:.2rem 0}header p{margin:0;color:var(--muted)}header>div:last-child{display:flex;gap:.4rem}button,input,select{min-height:34px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);padding:0 .55rem}.filters{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:.4rem;padding:.5rem;border:1px solid var(--border);border-bottom:0;background:var(--card-bg)}.grid{border:1px solid var(--border);background:#070d17}table{border-collapse:collapse;font-family:"SFMono-Regular",Consolas,monospace}th,td{padding:.42rem .5rem;border-right:1px solid rgba(151,166,196,.1);border-bottom:1px solid rgba(151,166,196,.08);text-align:left}th{background:#111b2d;color:#b8c4d8}tbody tr{cursor:pointer}tbody tr:hover,tbody tr.selected{background:rgba(143,122,255,.08)}.level-warn td:nth-child(3){color:#ffd166}.level-error td:nth-child(3),.level-fatal td:nth-child(3){color:var(--danger)}.level-info td:nth-child(3){color:#86b7ff}code{color:#93a4bc}.detail{margin-top:.65rem;border:1px solid var(--border);background:#070d17}.detail header{align-items:center;margin:0;padding:.55rem .65rem;border-bottom:1px solid var(--border)}.detail p{margin:0;padding:.65rem;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.detail pre{max-height:180px;overflow:auto;margin:0;padding:.65rem;white-space:pre-wrap;overflow-wrap:anywhere;color:#93a4bc}@media(max-width:700px){.filters{grid-template-columns:1fr}}
</style>