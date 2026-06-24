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
      const normalizedQuery = query.trim().toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        [provider.id, provider.label, provider.shortLabel, ...provider.aliases].some(
          (value) => value.toLowerCase().includes(normalizedQuery),
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
    void refresh();
    const timer = setInterval(refresh, 3_000);
    return () => clearInterval(timer);
  });

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
        return "Nicht verbunden";
      case "not-implemented":
        return "Nicht implementiert";
      default:
        return "Unbekannt";
    }
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

<div class="page">
  <header>
    <div>
      <small>PROVIDER RUNTIME</small>
      <h2>Provider</h2>
      <p>
        {runtime.length || PROVIDERS.length} Anbieter · Live-Daten aus dem Gateway
        {#if updatedAt}
          <span>· Stand {updatedAt.toLocaleTimeString("de-DE")}</span>
        {/if}
      </p>
    </div>
    <button class="refresh" onclick={refresh} disabled={refreshing}>
      {refreshing ? "Aktualisiere …" : "Aktualisieren"}
    </button>
  </header>

  <section class="summary" aria-label="Provider-Zusammenfassung">
    <article>
      <span>Ausführbar</span>
      <strong>{summary.runnable}</strong>
    </article>
    <article>
      <span>Bereit</span>
      <strong>{summary.healthy}</strong>
    </article>
    <article class:warning={summary.attention > 0}>
      <span>Prüfen</span>
      <strong>{summary.attention}</strong>
    </article>
    <article>
      <span>Aktive Accounts</span>
      <strong>{summary.validAccounts}</strong>
    </article>
    <article>
      <span>Modelle</span>
      <strong>{summary.models}</strong>
    </article>
  </section>

  <section class="filters">
    <input bind:value={query} placeholder="Provider suchen …" aria-label="Provider suchen" />
    <select bind:value={region} aria-label="Region filtern">
      <option value="all">Alle Regionen</option>
      <option value="global">Global</option>
      <option value="china">China</option>
    </select>
  </section>

  {#if error}
    <p class="error"><strong>Runtime nicht erreichbar:</strong> {error}</p>
  {/if}

  <div class="grid">
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Provider</th>
          <th>Region</th>
          <th>Accounts</th>
          <th>Modelle</th>
          <th>Runtime</th>
          <th>Letzter Login</th>
          <th>Aktion</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as provider, index (provider.id)}
          {@const job = jobFor(provider.id)}
          {@const live = runtimeFor(provider.id)}
          {@const jobText = job?.message ?? job?.failureReason ?? job?.status ?? "–"}
          <tr class:needsAttention={Boolean(live && live.status !== "healthy")}>
            <td>{index + 1}</td>
            <td>
              <div class="provider-name" title={provider.id}>
                <span class="dot" style={`--dot:${provider.color}`}></span>
                <span>
                  <b>{provider.label}</b>
                  <small>{live?.implementation ?? provider.aliases[0]}</small>
                </span>
              </div>
            </td>
            <td>{provider.region === "china" ? "China" : "Global"}</td>
            <td>
              <strong>{live?.validAccounts ?? 0}</strong>
              <small>von {live?.accounts ?? 0} aktiv</small>
            </td>
            <td><strong>{live?.models ?? 0}</strong></td>
            <td>
              <span class={`runtime ${live?.status ?? "unknown"}`}>
                {statusLabel(live?.status)}
              </span>
            </td>
            <td title={jobText}>
              <span class="truncate">{jobText}</span>
              {#if job?.accountLabel}<small>{job.accountLabel}</small>{/if}
            </td>
            <td>
              {#if provider.authType === "web-login"}
                <button
                  onclick={() => login(provider.id)}
                  disabled={busy === provider.id ||
                    ["starting", "waiting-for-user", "saving"].includes(job?.status ?? "")}
                >
                  {busy === provider.id
                    ? "Öffne …"
                    : job?.status === "succeeded"
                      ? "Neu anmelden"
                      : "Login"}
                </button>
              {:else}
                <span class="api-key">API-Key</span>
              {/if}
            </td>
          </tr>
          {#if live?.lastError}
            <tr class="detail-row">
              <td></td>
              <td colspan="7">
                <strong>Letzter Runtime-Fehler:</strong>
                <span>{live.lastError}</span>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page {
    padding: 0.25rem 0 1rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  header small {
    color: var(--accent-secondary);
  }

  h2 {
    margin: 0.2rem 0;
  }

  header p {
    margin: 0;
    color: var(--muted);
  }

  button,
  input,
  select {
    min-height: 36px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    padding: 0 0.65rem;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 0.65rem;
  }

  .summary article {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.7rem 0.8rem;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--card-bg);
  }

  .summary article.warning {
    border-color: rgba(255, 209, 102, 0.45);
  }

  .summary span {
    color: var(--muted);
    font-size: 0.72rem;
  }

  .summary strong {
    font-size: 1.15rem;
  }

  .filters {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 170px;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-bottom: 0;
    background: var(--card-bg);
  }

  .grid {
    overflow-x: auto;
    border: 1px solid var(--border);
  }

  table {
    width: 100%;
    min-width: 960px;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.55rem 0.65rem;
    border-right: 1px solid rgba(151, 166, 196, 0.12);
    border-bottom: 1px solid rgba(151, 166, 196, 0.12);
    text-align: left;
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: #111b2d;
    color: #b8c4d8;
    font-size: 0.72rem;
  }

  tbody tr:hover {
    background: rgba(143, 122, 255, 0.06);
  }

  tr.needsAttention {
    background: rgba(255, 209, 102, 0.025);
  }

  .provider-name {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    min-width: 180px;
  }

  .provider-name > span:last-child {
    display: grid;
    gap: 0.12rem;
  }

  .dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--dot);
  }

  td small {
    display: block;
    color: var(--muted);
    font-size: 0.68rem;
  }

  .runtime,
  .api-key {
    display: inline-flex;
    padding: 0.18rem 0.45rem;
    border-radius: 999px;
    background: rgba(145, 160, 184, 0.12);
    white-space: nowrap;
  }

  .runtime.healthy {
    color: var(--success);
    background: rgba(65, 201, 131, 0.1);
  }

  .runtime.degraded,
  .runtime.login-required,
  .runtime.disconnected {
    color: #ffd166;
    background: rgba(255, 209, 102, 0.1);
  }

  .runtime.not-implemented {
    color: var(--danger);
    background: rgba(255, 99, 132, 0.1);
  }

  .truncate {
    display: block;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail-row td {
    padding-top: 0.45rem;
    padding-bottom: 0.55rem;
    color: #ffd2d2;
    background: rgba(255, 99, 132, 0.055);
    white-space: normal;
  }

  .detail-row strong {
    margin-right: 0.4rem;
  }

  .error {
    margin: 0 0 0.6rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid rgba(255, 99, 132, 0.35);
    border-radius: 6px;
    color: var(--danger);
    background: rgba(255, 99, 132, 0.06);
  }

  @media (max-width: 900px) {
    .summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 700px) {
    header {
      align-items: stretch;
      flex-direction: column;
    }

    .filters,
    .summary {
      grid-template-columns: 1fr;
    }
  }
</style>
