<script lang="ts">
  import { onMount } from "svelte";
  import { PROVIDERS } from "../lib/providers";

  type Job = {
    id: string;
    providerId: string;
    status: string;
    message?: string;
    accountLabel?: string;
    failureReason?: string;
  };

  type Runtime = {
    id: string;
    implementation: string;
    label: string;
    status: string;
    runnable: boolean;
    accounts: number;
    validAccounts: number;
    models: number;
    lastError?: string | null;
  };

  type StoredFilters = {
    query?: string;
    region?: string;
  };

  const FILTER_STORAGE_KEY = "nova.providers.filters";

  let jobs = $state<Job[]>([]);
  let runtime = $state<Runtime[]>([]);
  let query = $state("");
  let region = $state("all");
  let busy = $state("");
  let error = $state("");
  let refreshing = $state(false);
  let updatedAt = $state<Date | null>(null);

  const rows = $derived(
    PROVIDERS.filter((provider) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        !needle ||
        [provider.id, provider.label, provider.shortLabel, provider.description, ...provider.aliases].some(
          (value) => value.toLowerCase().includes(needle),
        );
      return matchesQuery && (region === "all" || provider.region === region);
    }),
  );

  const summary = $derived({
    runnable: runtime.filter((item) => item.runnable).length,
    healthy: runtime.filter((item) => item.status === "healthy").length,
    attention: runtime.filter((item) =>
      ["degraded", "login-required", "disconnected"].includes(item.status),
    ).length,
    validAccounts: runtime.reduce((total, item) => total + item.validAccounts, 0),
    models: runtime.reduce((total, item) => total + item.models, 0),
  });

  onMount(() => {
    restoreFilters();
    void refresh();
    const timer = window.setInterval(refresh, 3_000);
    return () => window.clearInterval(timer);
  });

  function restoreFilters(): void {
    try {
      const stored = JSON.parse(window.localStorage.getItem(FILTER_STORAGE_KEY) ?? "{}") as StoredFilters;
      query = stored.query ?? "";
      region = ["all", "global", "china"].includes(stored.region ?? "") ? stored.region! : "all";
    } catch {
      window.localStorage.removeItem(FILTER_STORAGE_KEY);
    }
  }

  function persistFilters(): void {
    window.localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ query, region }));
  }

  function updateQuery(event: Event): void {
    query = (event.currentTarget as HTMLInputElement).value;
    persistFilters();
  }

  function updateRegion(event: Event): void {
    region = (event.currentTarget as HTMLSelectElement).value;
    persistFilters();
  }

  async function refresh(): Promise<void> {
    if (refreshing) return;
    refreshing = true;

    try {
      const [jobsResponse, runtimeResponse] = await Promise.all([
        fetch("/api/discovery/logins", { cache: "no-store" }),
        fetch("/api/provider-runtime", { cache: "no-store" }),
      ]);

      if (!jobsResponse.ok || !runtimeResponse.ok) {
        throw new Error(`HTTP ${jobsResponse.status}/${runtimeResponse.status}`);
      }

      const jobsBody = (await jobsResponse.json()) as { jobs?: Job[] };
      jobs = jobsBody.jobs ?? [];
      runtime = (await runtimeResponse.json()) as Runtime[];
      updatedAt = new Date();
      error = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      refreshing = false;
    }
  }

  function jobFor(id: string): Job | undefined {
    return jobs.find((job) => job.providerId === id);
  }

  function runtimeFor(id: string): Runtime | undefined {
    return runtime.find((item) => item.id === id);
  }

  function statusLabel(status?: string): string {
    switch (status) {
      case "healthy":
        return "Bereit";
      case "degraded":
        return "Eingeschränkt";
      case "login-required":
        return "Login nötig";
      case "disconnected":
        return "Getrennt";
      case "not-implemented":
        return "Nicht bereit";
      default:
        return "Unbekannt";
    }
  }

  function activityLabel(job?: Job): string {
    if (!job) return "Keine Aktivität";
    return job.message ?? job.failureReason ?? job.status;
  }

  async function login(id: string): Promise<void> {
    busy = id;
    try {
      const response = await fetch("/api/discovery/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId: id }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      await refresh();
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      busy = "";
    }
  }
</script>

<div class="provider-page">
  <section class="hero-panel">
    <div class="hero-copy">
      <span class="eyebrow">PROVIDER OPERATIONS</span>
      <h2>Runtime Control Matrix</h2>
      <p>
        {rows.length} von {PROVIDERS.length} Providern sichtbar · Live-Zustand aus dem Gateway
        {#if updatedAt}<span> · {updatedAt.toLocaleTimeString("de-DE")}</span>{/if}
      </p>
    </div>
    <button class="refresh-button" onclick={refresh} disabled={refreshing}>
      <span class:spinning={refreshing}>↻</span>
      {refreshing ? "Synchronisiere" : "Synchronisieren"}
    </button>
  </section>

  <section class="summary-grid" aria-label="Provider-Zusammenfassung">
    <article class="metric magenta">
      <span>Ausführbar</span>
      <strong>{summary.runnable}</strong>
      <small>registrierte Adapter</small>
    </article>
    <article class="metric blue">
      <span>Bereit</span>
      <strong>{summary.healthy}</strong>
      <small>gesunde Runtimes</small>
    </article>
    <article class:warning={summary.attention > 0} class="metric orange">
      <span>Prüfen</span>
      <strong>{summary.attention}</strong>
      <small>benötigen Aufmerksamkeit</small>
    </article>
    <article class="metric blue">
      <span>Accounts</span>
      <strong>{summary.validAccounts}</strong>
      <small>aktive Sitzungen</small>
    </article>
    <article class="metric magenta">
      <span>Modelle</span>
      <strong>{summary.models}</strong>
      <small>aktuell verfügbar</small>
    </article>
  </section>

  <section class="control-strip">
    <label class="search-field">
      <span>⌕</span>
      <input
        value={query}
        oninput={updateQuery}
        placeholder="Provider, Alias oder Implementierung suchen"
        aria-label="Provider suchen"
      />
    </label>
    <label class="region-field">
      <span>Region</span>
      <select value={region} onchange={updateRegion} aria-label="Region filtern">
        <option value="all">Alle</option>
        <option value="global">Global</option>
        <option value="china">China</option>
      </select>
    </label>
    <div class="result-count"><strong>{rows.length}</strong><span>Datensätze</span></div>
  </section>

  {#if error}
    <div class="error-banner" role="alert">
      <span>!</span>
      <div><strong>Runtime nicht erreichbar</strong><small>{error}</small></div>
    </div>
  {/if}

  <section class="data-grid" aria-label="Provider Runtime Tabelle">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Provider / Implementierung</th>
          <th>Region</th>
          <th>Accounts</th>
          <th>Modelle</th>
          <th>Runtime</th>
          <th>Letzte Aktivität</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as provider, index (provider.id)}
          {@const job = jobFor(provider.id)}
          {@const live = runtimeFor(provider.id)}
          {@const activity = activityLabel(job)}
          <tr class:needsAttention={Boolean(live && live.status !== "healthy")} style={`--provider-color:${provider.color}`}>
            <td class="index-cell">{String(index + 1).padStart(2, "0")}</td>
            <td>
              <div class="provider-cell" title={provider.id}>
                <span class="provider-dot"></span>
                <div>
                  <strong>{provider.label}</strong>
                  <small>{live?.implementation ?? provider.description}</small>
                </div>
              </div>
            </td>
            <td><span class={`region-tag ${provider.region}`}>{provider.region === "china" ? "China" : "Global"}</span></td>
            <td><div class="number-cell"><strong>{live?.validAccounts ?? 0}</strong><small>/ {live?.accounts ?? 0}</small></div></td>
            <td><span class="model-count">{live?.models ?? 0}</span></td>
            <td><span class={`runtime-status ${live?.status ?? "unknown"}`}><i></i>{statusLabel(live?.status)}</span></td>
            <td title={activity}>
              <div class="activity-cell">
                <span>{activity}</span>
                {#if job?.accountLabel}<small>{job.accountLabel}</small>{/if}
              </div>
            </td>
            <td>
              {#if provider.authType === "web-login"}
                <button
                  class="login-button"
                  onclick={() => login(provider.id)}
                  disabled={busy === provider.id || ["starting", "waiting-for-user", "saving"].includes(job?.status ?? "")}
                >
                  {busy === provider.id ? "Öffne" : job?.status === "succeeded" ? "Erneuern" : "Login"}
                </button>
              {:else}
                <span class="api-key-badge">API-Key</span>
              {/if}
            </td>
          </tr>
          {#if live?.lastError}
            <tr class="detail-row">
              <td></td>
              <td colspan="7"><strong>Runtime-Fehler</strong><span>{live.lastError}</span></td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>

    {#if rows.length === 0}
      <div class="empty-state"><strong>Keine Provider gefunden</strong><span>Suche oder Region zurücksetzen.</span></div>
    {/if}
  </section>
</div>

<style>
  .provider-page { display: grid; gap: 0.75rem; min-width: 0; padding-bottom: 2.4rem; }

  .hero-panel {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 1rem;
    padding: 1rem 1.1rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 10px;
    background:
      linear-gradient(115deg, rgba(255, 59, 167, 0.08), transparent 38%),
      linear-gradient(290deg, rgba(105, 217, 255, 0.07), transparent 35%),
      var(--card-bg);
  }
  .hero-panel::before { content: ""; position: absolute; inset: 0 0 auto; height: 1px; background: linear-gradient(90deg, var(--accent), var(--accent-warm), var(--accent-secondary)); }
  .hero-copy { min-width: 0; }
  .eyebrow { color: var(--accent-secondary); font-size: 0.59rem; font-weight: 700; letter-spacing: 0.16em; }
  h2 { margin: 0.2rem 0 0.18rem; font-size: clamp(1.25rem, 2.2vw, 1.75rem); letter-spacing: -0.035em; }
  .hero-copy p { margin: 0; color: var(--muted); font-size: 0.72rem; }
  .refresh-button {
    display: inline-grid;
    grid-template-columns: auto auto;
    align-items: center;
    gap: 0.45rem;
    min-height: 36px;
    padding: 0 0.8rem;
    border: 1px solid rgba(105, 217, 255, 0.28);
    border-radius: 7px;
    background: rgba(105, 217, 255, 0.055);
    color: #dff8ff;
    cursor: pointer;
    font-size: 0.7rem;
  }
  .refresh-button:hover { border-color: rgba(105, 217, 255, 0.55); background: rgba(105, 217, 255, 0.1); }
  .refresh-button:disabled { cursor: wait; opacity: 0.7; }
  .spinning { display: inline-block; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .summary-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 0.55rem; }
  .metric {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 0.12rem 0.6rem;
    min-width: 0;
    padding: 0.72rem 0.8rem;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: linear-gradient(145deg, rgba(255, 255, 255, 0.025), transparent), var(--card-bg);
  }
  .metric::after { content: ""; position: absolute; inset: auto 0 0; height: 2px; opacity: 0.78; }
  .metric.magenta::after { background: linear-gradient(90deg, var(--accent), transparent); }
  .metric.orange::after { background: linear-gradient(90deg, var(--accent-warm), transparent); }
  .metric.blue::after { background: linear-gradient(90deg, var(--accent-secondary), transparent); }
  .metric.warning { border-color: rgba(255, 148, 77, 0.35); }
  .metric span { min-width: 0; overflow: hidden; color: var(--muted); font-size: 0.66rem; text-overflow: ellipsis; white-space: nowrap; }
  .metric strong { grid-row: span 2; font-size: 1.28rem; font-variant-numeric: tabular-nums; }
  .metric small { min-width: 0; overflow: hidden; color: #53627a; font-size: 0.56rem; text-overflow: ellipsis; white-space: nowrap; }

  .control-strip {
    display: grid;
    grid-template-columns: minmax(220px, 1fr) 160px 88px;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: rgba(11, 17, 29, 0.82);
  }
  .search-field { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; min-width: 0; border: 1px solid rgba(145, 174, 214, 0.16); border-radius: 6px; background: rgba(5, 9, 17, 0.64); }
  .search-field > span { display: grid; place-items: center; color: var(--accent-secondary); }
  input, select { width: 100%; min-width: 0; min-height: 34px; border: 0; background: transparent; color: var(--text); outline: 0; font-size: 0.7rem; }
  input { padding: 0 0.65rem 0 0; }
  input::placeholder { color: #53627a; }
  .region-field { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 0.45rem; min-width: 0; padding-left: 0.6rem; border: 1px solid rgba(145, 174, 214, 0.16); border-radius: 6px; background: rgba(5, 9, 17, 0.64); }
  .region-field > span { color: #65748d; font-size: 0.61rem; text-transform: uppercase; letter-spacing: 0.08em; }
  select { padding-right: 0.4rem; }
  .result-count { display: grid; justify-items: end; }
  .result-count strong { color: var(--accent-warm); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .result-count span { color: #617089; font-size: 0.55rem; text-transform: uppercase; letter-spacing: 0.08em; }

  .error-banner { display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 0.55rem; padding: 0.6rem 0.72rem; border: 1px solid rgba(255, 111, 133, 0.3); border-radius: 7px; background: rgba(255, 111, 133, 0.065); color: #ffd7de; }
  .error-banner > span { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: rgba(255, 111, 133, 0.12); font-weight: 800; }
  .error-banner strong, .error-banner small { display: block; }
  .error-banner strong { font-size: 0.69rem; }
  .error-banner small { margin-top: 0.08rem; color: #d99ba8; font-size: 0.62rem; }

  .data-grid { min-width: 0; overflow: hidden; border: 1px solid var(--border); border-radius: 9px; background: rgba(8, 13, 23, 0.88); box-shadow: 0 16px 48px rgba(0, 0, 0, 0.16); }
  table { width: 100%; min-width: 0; table-layout: fixed; border-collapse: collapse; }
  th, td { min-width: 0; padding: 0.56rem 0.62rem; overflow: hidden; border-right: 1px solid rgba(145, 174, 214, 0.09); border-bottom: 1px solid rgba(145, 174, 214, 0.1); text-align: left; vertical-align: middle; }
  th:last-child, td:last-child { border-right: 0; }
  th:nth-child(1), td:nth-child(1) { width: 42px; }
  th:nth-child(2), td:nth-child(2) { width: 25%; }
  th:nth-child(3), td:nth-child(3) { width: 8%; }
  th:nth-child(4), td:nth-child(4) { width: 9%; }
  th:nth-child(5), td:nth-child(5) { width: 7%; }
  th:nth-child(6), td:nth-child(6) { width: 13%; }
  th:nth-child(7), td:nth-child(7) { width: 24%; }
  th:nth-child(8), td:nth-child(8) { width: 88px; }
  th { position: sticky; top: 0; z-index: 2; background: rgba(15, 23, 38, 0.97); color: #8f9db3; font-size: 0.58rem; font-weight: 700; letter-spacing: 0.075em; text-transform: uppercase; backdrop-filter: blur(16px); }
  tbody tr { transition: background 0.14s ease; }
  tbody tr:hover { background: rgba(105, 217, 255, 0.035); }
  tbody tr.needsAttention { background: rgba(255, 148, 77, 0.018); }
  .index-cell { color: #53627a; font-size: 0.62rem; font-variant-numeric: tabular-nums; }
  .provider-cell { display: grid; grid-template-columns: 9px minmax(0, 1fr); align-items: center; gap: 0.5rem; min-width: 0; }
  .provider-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--provider-color); box-shadow: 0 0 12px color-mix(in srgb, var(--provider-color) 58%, transparent); }
  .provider-cell div { min-width: 0; }
  .provider-cell strong, .provider-cell small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .provider-cell strong { font-size: 0.7rem; font-weight: 680; }
  .provider-cell small { margin-top: 0.1rem; color: #62718a; font-size: 0.57rem; }
  .region-tag, .runtime-status, .api-key-badge { display: inline-flex; align-items: center; max-width: 100%; border-radius: 999px; white-space: nowrap; }
  .region-tag { padding: 0.15rem 0.42rem; background: rgba(105, 217, 255, 0.07); color: #8ee4ff; font-size: 0.57rem; }
  .region-tag.china { background: rgba(255, 148, 77, 0.075); color: #ffb37d; }
  .number-cell { display: flex; align-items: baseline; gap: 0.22rem; font-variant-numeric: tabular-nums; }
  .number-cell strong { font-size: 0.73rem; }
  .number-cell small { color: #5c6b82; font-size: 0.56rem; }
  .model-count { font-size: 0.72rem; font-variant-numeric: tabular-nums; }
  .runtime-status { gap: 0.36rem; padding: 0.16rem 0.44rem; background: rgba(145, 160, 184, 0.08); color: #9eabc0; font-size: 0.58rem; }
  .runtime-status i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 8px currentColor; opacity: 0.76; }
  .runtime-status.healthy { color: var(--success); background: rgba(67, 217, 163, 0.075); }
  .runtime-status.degraded, .runtime-status.login-required, .runtime-status.disconnected { color: var(--warning); background: rgba(255, 179, 92, 0.075); }
  .runtime-status.not-implemented { color: var(--danger); background: rgba(255, 111, 133, 0.075); }
  .activity-cell { min-width: 0; }
  .activity-cell span, .activity-cell small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-cell span { color: #a8b4c7; font-size: 0.62rem; }
  .activity-cell small { margin-top: 0.1rem; color: #5b6a81; font-size: 0.55rem; }
  .login-button { width: 100%; min-height: 29px; padding: 0 0.52rem; border: 1px solid rgba(255, 59, 167, 0.24); border-radius: 5px; background: rgba(255, 59, 167, 0.07); color: #ffc5e5; cursor: pointer; font-size: 0.58rem; }
  .login-button:hover { border-color: rgba(255, 59, 167, 0.48); background: rgba(255, 59, 167, 0.13); }
  .login-button:disabled { cursor: wait; opacity: 0.58; }
  .api-key-badge { padding: 0.18rem 0.4rem; background: rgba(105, 217, 255, 0.07); color: #8ee4ff; font-size: 0.56rem; }
  .detail-row td { padding: 0.45rem 0.62rem; background: rgba(255, 111, 133, 0.045); color: #dba4ae; font-size: 0.59rem; white-space: normal; }
  .detail-row strong { margin-right: 0.5rem; color: #ff8497; font-size: 0.55rem; letter-spacing: 0.06em; text-transform: uppercase; }
  .empty-state { display: grid; justify-items: center; gap: 0.25rem; padding: 2.6rem 1rem; color: #5c6b82; }
  .empty-state strong { color: #9ba8bc; font-size: 0.76rem; }
  .empty-state span { font-size: 0.63rem; }

  @media (max-width: 1180px) {
    .summary-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    th:nth-child(3), td:nth-child(3), th:nth-child(5), td:nth-child(5) { display: none; }
    th:nth-child(2), td:nth-child(2) { width: 30%; }
    th:nth-child(4), td:nth-child(4) { width: 11%; }
    th:nth-child(6), td:nth-child(6) { width: 16%; }
    th:nth-child(7), td:nth-child(7) { width: 30%; }
  }

  @media (max-width: 760px) {
    .provider-page { gap: 0.6rem; }
    .hero-panel { grid-template-columns: 1fr; align-items: stretch; }
    .refresh-button { justify-self: start; }
    .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .control-strip { grid-template-columns: 1fr 120px; }
    .result-count { display: none; }
    th:nth-child(4), td:nth-child(4), th:nth-child(7), td:nth-child(7) { display: none; }
    th:nth-child(2), td:nth-child(2) { width: auto; }
    th:nth-child(6), td:nth-child(6) { width: 120px; }
    th:nth-child(8), td:nth-child(8) { width: 76px; }
  }

  @media (max-width: 520px) {
    .summary-grid, .control-strip { grid-template-columns: 1fr; }
    .region-field { padding-right: 0.45rem; }
    th:nth-child(1), td:nth-child(1) { display: none; }
    th:nth-child(6), td:nth-child(6) { width: 104px; }
    .provider-cell small { display: none; }
  }
</style>
