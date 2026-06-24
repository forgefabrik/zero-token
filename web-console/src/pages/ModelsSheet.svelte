<script lang="ts">
  import { getModels, refreshModels } from "../lib/api";
  import type { Model } from "../lib/api";

  const PAGE_SIZE = 50;
  let rows = $state<Model[]>([]);
  let query = $state("");
  let provider = $state("all");
  let busy = $state(false);
  let error = $state("");
  let copied = $state("");
  let page = $state(1);

  const providers = $derived([...new Set(rows.map((row) => row.provider))].sort());
  const filtered = $derived(rows.filter((row) => {
    const needle = query.trim().toLowerCase();
    return (!needle || [row.name, row.id, row.provider].some((value) => value.toLowerCase().includes(needle))) &&
      (provider === "all" || row.provider === provider);
  }));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleRows = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

  $effect(() => { void load(); });
  $effect(() => { query; provider; page = 1; });
  $effect(() => { if (page > pageCount) page = pageCount; });

  async function load() {
    try { rows = await getModels(); error = ""; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }

  async function refresh() {
    busy = true;
    try { rows = (await refreshModels()).models; error = ""; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
    finally { busy = false; }
  }

  async function copy(id: string) {
    await navigator.clipboard.writeText(id);
    copied = id;
    window.setTimeout(() => copied = "", 1200);
  }
</script>

<div class="page">
  <header>
    <div><small>MODEL REGISTER</small><h2>Modelle</h2><p>{filtered.length} von {rows.length} Modellen</p></div>
    <button onclick={refresh} disabled={busy}>{busy ? "Aktualisiere …" : "Cache aktualisieren"}</button>
  </header>

  <section class="filters">
    <input bind:value={query} placeholder="Modell oder ID suchen …" />
    <select bind:value={provider}><option value="all">Alle Provider</option>{#each providers as value}<option value={value}>{value}</option>{/each}</select>
  </section>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="grid">
    <table>
      <thead><tr><th>#</th><th>Provider</th><th>Modell</th><th>Modell-ID</th><th>Text</th><th>Vision</th><th>Voice</th><th>Plugins</th><th>Status</th><th>Aktion</th></tr></thead>
      <tbody>
        {#each visibleRows as row, index (row.id)}
          <tr>
            <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td title={row.provider}>{row.provider}</td>
            <td title={row.name}><b>{row.name}</b></td>
            <td title={row.id}><code>{row.id}</code></td>
            <td>{row.capabilities.text ? "Ja" : "–"}</td>
            <td>{row.capabilities.vision ? "Ja" : "–"}</td>
            <td>{row.capabilities.voice ? "Ja" : "–"}</td>
            <td>{row.capabilities.plugins ? "Ja" : "–"}</td>
            <td><span class:active={row.enabled}>{row.enabled ? "Aktiv" : "Inaktiv"}</span></td>
            <td><button onclick={() => copy(row.id)}>{copied === row.id ? "Kopiert" : "ID kopieren"}</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pager"><span>Seite {page} von {pageCount} · maximal {PAGE_SIZE} Zeilen</span><button onclick={() => page--} disabled={page <= 1}>‹</button><button onclick={() => page++} disabled={page >= pageCount}>›</button></div>
</div>

<style>
  .page{padding:.25rem 0 1rem}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:.6rem}header small{color:var(--accent-secondary)}h2{margin:.2rem 0}header p{margin:0;color:var(--muted)}button,input,select{min-height:34px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);padding:0 .55rem}.filters{display:grid;grid-template-columns:minmax(0,1fr) 200px;gap:.4rem;padding:.5rem;border:1px solid var(--border);border-bottom:0;background:var(--card-bg)}.grid{border:1px solid var(--border)}table{border-collapse:collapse}th,td{padding:.45rem .55rem;border-right:1px solid rgba(151,166,196,.12);border-bottom:1px solid rgba(151,166,196,.12);text-align:left}th{background:#111b2d;color:#b8c4d8}tbody tr:hover{background:rgba(143,122,255,.06)}code{font-size:.68rem;color:#c8d2e4}.active{color:var(--success)}.error{color:var(--danger)}@media(max-width:700px){.filters{grid-template-columns:1fr}}
</style>