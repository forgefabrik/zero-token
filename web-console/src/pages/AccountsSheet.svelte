<script lang="ts">
  import { deleteAccount, listAccounts, validateAccount } from "../lib/api";
  import type { Account } from "../lib/api";

  const PAGE_SIZE = 50;
  let rows = $state<Account[]>([]);
  let query = $state("");
  let provider = $state("all");
  let status = $state("all");
  let busy = $state("");
  let error = $state("");
  let page = $state(1);

  const providers = $derived([...new Set(rows.map((row) => row.provider))].sort());
  const filtered = $derived(rows.filter((row) => {
    const needle = query.trim().toLowerCase();
    return (!needle || [row.label, row.email ?? "", row.provider].some((value) => value.toLowerCase().includes(needle))) &&
      (provider === "all" || row.provider === provider) &&
      (status === "all" || row.sessionStatus === status);
  }));
  const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const visibleRows = $derived(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

  $effect(() => { void load(); });
  $effect(() => { query; provider; status; page = 1; });
  $effect(() => { if (page > pageCount) page = pageCount; });

  async function load() {
    try { rows = await listAccounts(); error = ""; }
    catch (cause) { error = cause instanceof Error ? cause.message : String(cause); }
  }

  async function check(id: string) {
    busy = id;
    try { await validateAccount(id); await load(); }
    finally { busy = ""; }
  }

  async function remove(row: Account) {
    if (!confirm(`Account „${row.label}“ löschen?`)) return;
    busy = row.id;
    try { await deleteAccount(row.id); await load(); }
    finally { busy = ""; }
  }

  const date = (value?: string) => value
    ? new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "–";
</script>

<div class="page">
  <header>
    <div><small>ACCOUNT REGISTER</small><h2>Accounts</h2><p>{filtered.length} von {rows.length} Konten</p></div>
    <button onclick={load}>Aktualisieren</button>
  </header>

  <section class="filters">
    <input bind:value={query} placeholder="Suchen …" />
    <select bind:value={provider}><option value="all">Alle Provider</option>{#each providers as value}<option value={value}>{value}</option>{/each}</select>
    <select bind:value={status}><option value="all">Alle Status</option><option value="valid">Gültig</option><option value="expired">Abgelaufen</option><option value="login-required">Login nötig</option><option value="error">Fehler</option></select>
  </section>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="grid">
    <table>
      <thead><tr><th>#</th><th>Provider</th><th>Account</th><th>E-Mail</th><th>Plan</th><th>Status</th><th>Prio</th><th>Validiert</th><th>Zuletzt genutzt</th><th>Aktionen</th></tr></thead>
      <tbody>
        {#each visibleRows as row, index (row.id)}
          <tr>
            <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
            <td title={row.provider}>{row.provider}</td>
            <td title={`${row.label} · ${row.id}`}><b>{row.label}</b><small>{row.id}</small></td>
            <td title={row.email ?? ""}>{row.email ?? "–"}</td>
            <td title={row.plan ?? "unknown"}>{row.plan ?? "unknown"}</td>
            <td><span class={`status ${row.sessionStatus}`}>{row.sessionStatus}</span></td>
            <td>{row.priority}</td>
            <td>{date(row.lastValidatedAt)}</td>
            <td>{date(row.lastUsedAt)}</td>
            <td><button onclick={() => check(row.id)} disabled={busy === row.id}>Prüfen</button><button class="danger" onclick={() => remove(row)} disabled={busy === row.id}>Löschen</button></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="pager"><span>Seite {page} von {pageCount} · maximal {PAGE_SIZE} Zeilen</span><button onclick={() => page--} disabled={page <= 1}>‹</button><button onclick={() => page++} disabled={page >= pageCount}>›</button></div>
</div>

<style>
  .page{padding:.25rem 0 1rem}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:.6rem}header small{color:var(--accent-secondary)}h2{margin:.2rem 0}header p{margin:0;color:var(--muted)}button,input,select{min-height:34px;border:1px solid var(--border);border-radius:5px;background:var(--surface);color:var(--text);padding:0 .55rem}.filters{display:grid;grid-template-columns:minmax(0,1fr) 190px 170px;gap:.4rem;padding:.5rem;border:1px solid var(--border);border-bottom:0;background:var(--card-bg)}.grid{border:1px solid var(--border)}table{border-collapse:collapse}th,td{padding:.45rem .55rem;border-right:1px solid rgba(151,166,196,.12);border-bottom:1px solid rgba(151,166,196,.12);text-align:left}th{background:#111b2d;color:#b8c4d8}tbody tr:hover{background:rgba(143,122,255,.06)}td small{color:var(--muted)}.status{padding:.15rem .4rem;border-radius:999px;background:rgba(145,160,184,.12)}.status.valid{color:var(--success)}.status.error,.status.expired,.status.login-required{color:var(--danger)}td button{margin-right:.25rem}.danger,.error{color:var(--danger)}@media(max-width:700px){.filters{grid-template-columns:1fr}}
</style>