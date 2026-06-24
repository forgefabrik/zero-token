<script lang="ts">
  import { onMount } from "svelte";
  import { PROVIDERS, providerLoginCommand } from "../lib/providers";

  type LoginStatus = "starting" | "waiting-for-user" | "saving" | "succeeded" | "failed";

  interface LoginJob {
    id: string;
    providerId: string;
    providerLabel: string;
    loginUrl: string;
    status: LoginStatus;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
    accountId?: string;
    accountLabel?: string;
    failureReason?: string;
    message?: string;
  }

  let query = $state("");
  let region = $state<"all" | "global" | "china">("all");
  let authType = $state<"all" | "web-login" | "api-key">("all");
  let copied = $state<string | null>(null);
  let jobs = $state<LoginJob[]>([]);
  let loadingJobs = $state(true);
  let actionError = $state<string | null>(null);

  const filtered = $derived(
    PROVIDERS.filter((provider) => {
      const needle = query.trim().toLowerCase();
      const matchesQuery =
        !needle ||
        provider.label.toLowerCase().includes(needle) ||
        provider.id.toLowerCase().includes(needle) ||
        provider.aliases.some((alias) => alias.includes(needle));
      const matchesRegion = region === "all" || provider.region === region;
      const matchesAuth = authType === "all" || provider.authType === authType;
      return matchesQuery && matchesRegion && matchesAuth;
    }),
  );

  const activeJobs = $derived(
    jobs.filter((job) => ["starting", "waiting-for-user", "saving"].includes(job.status)),
  );

  onMount(() => {
    void refreshJobs();
    const timer = window.setInterval(refreshJobs, 2_000);
    return () => window.clearInterval(timer);
  });

  function latestJob(providerId: string): LoginJob | undefined {
    return jobs.find((job) => job.providerId === providerId);
  }

  function isRunning(job?: LoginJob): boolean {
    return Boolean(job && ["starting", "waiting-for-user", "saving"].includes(job.status));
  }

  function statusLabel(job: LoginJob): string {
    switch (job.status) {
      case "starting": return "Browser startet";
      case "waiting-for-user": return "Warte auf Anmeldung";
      case "saving": return "Session wird gespeichert";
      case "succeeded": return "Verbunden";
      case "failed": return "Fehlgeschlagen";
    }
  }

  async function refreshJobs() {
    try {
      const response = await fetch("/api/discovery/logins", { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as { jobs: LoginJob[] };
      jobs = payload.jobs;
      actionError = null;
    } catch (error) {
      actionError = error instanceof Error ? error.message : "Login-Status konnte nicht geladen werden";
    } finally {
      loadingJobs = false;
    }
  }

  async function startLogin(providerId: string) {
    actionError = null;
    try {
      const response = await fetch("/api/discovery/logins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const payload = (await response.json()) as LoginJob | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload && payload.error ? payload.error : `HTTP ${response.status}`);
      }
      jobs = [payload as LoginJob, ...jobs.filter((job) => job.id !== (payload as LoginJob).id)];
    } catch (error) {
      actionError = error instanceof Error ? error.message : "Login konnte nicht gestartet werden";
    }
  }

  async function copyCommand(id: string) {
    const provider = PROVIDERS.find((item) => item.id === id);
    if (!provider) return;
    await navigator.clipboard.writeText(providerLoginCommand(provider));
    copied = id;
    window.setTimeout(() => {
      if (copied === id) copied = null;
    }, 1800);
  }
</script>

<div class="page">
  <section class="hero">
    <div>
      <span class="eyebrow">Provider Control</span>
      <h2>Provider verbinden</h2>
      <p>
        Starte Browser-Logins direkt aus Nova. Passwörter werden ausschließlich auf der
        jeweiligen Provider-Seite eingegeben und niemals an die Web-Konsole übertragen.
      </p>
    </div>
    <div class="hero-stats">
      <div><strong>{PROVIDERS.length}</strong><span>Provider</span></div>
      <div><strong>{activeJobs.length}</strong><span>aktive Logins</span></div>
    </div>
  </section>

  {#if actionError}
    <div class="notice error">
      <strong>Login-Steuerung</strong>
      <span>{actionError}</span>
      <button onclick={refreshJobs}>Neu laden</button>
    </div>
  {/if}

  <section class="toolbar" aria-label="Provider filtern">
    <label class="search">
      <span>⌕</span>
      <input bind:value={query} placeholder="Provider suchen" aria-label="Provider suchen" />
    </label>
    <select bind:value={region} aria-label="Region filtern">
      <option value="all">Alle Regionen</option>
      <option value="global">Global</option>
      <option value="china">China</option>
    </select>
    <select bind:value={authType} aria-label="Authentifizierung filtern">
      <option value="all">Alle Auth-Typen</option>
      <option value="web-login">Browser-Login</option>
      <option value="api-key">API-Key</option>
    </select>
  </section>

  <div class="provider-grid">
    {#each filtered as provider}
      {@const job = latestJob(provider.id)}
      <article class:connected={job?.status === "succeeded"} class="provider-card">
        <div class="provider-head">
          <div class="provider-mark" style={`--provider-color:${provider.color}`}>
            {provider.shortLabel.slice(0, 2).toUpperCase()}
          </div>
          <div class="provider-title">
            <h3>{provider.label}</h3>
            <code>{provider.id}</code>
          </div>
          {#if job}
            <span class:success={job.status === "succeeded"} class:failed={job.status === "failed"} class:running={isRunning(job)} class="job-state">
              {statusLabel(job)}
            </span>
          {/if}
        </div>

        <p>{provider.description}</p>

        <div class="meta">
          <span>{provider.authType === "web-login" ? "Browser-Login" : "API-Key"}</span>
          <span>{provider.region === "global" ? "Global" : "China"}</span>
          {#if provider.plan}<span>{provider.plan}</span>{/if}
        </div>

        {#if job}
          <div class:failed={job.status === "failed"} class:success={job.status === "succeeded"} class="job-detail">
            <span class:spin={isRunning(job)} class="job-dot"></span>
            <div>
              <strong>{job.message ?? statusLabel(job)}</strong>
              {#if job.accountLabel}<small>Account: {job.accountLabel}</small>{/if}
              {#if job.failureReason}<small>Grund: {job.failureReason}</small>{/if}
            </div>
          </div>
        {/if}

        {#if provider.authType === "web-login"}
          <button
            class="primary-action"
            disabled={isRunning(job) || loadingJobs}
            onclick={() => startLogin(provider.id)}
          >
            {isRunning(job)
              ? "Anmeldung läuft …"
              : job?.status === "succeeded"
                ? "Weiteren Account anmelden"
                : job?.status === "failed"
                  ? "Erneut versuchen"
                  : "Browser-Login starten"}
          </button>
        {:else}
          <div class="command">
            <code>{providerLoginCommand(provider)}</code>
            <button onclick={() => copyCommand(provider.id)} aria-label={`Befehl für ${provider.label} kopieren`}>
              {copied === provider.id ? "Kopiert" : "Kopieren"}
            </button>
          </div>
        {/if}
      </article>
    {/each}
  </div>

  {#if filtered.length === 0}
    <div class="empty">
      <strong>Keine Treffer</strong>
      <span>Ändere Suche oder Filter.</span>
    </div>
  {/if}

  <div class="security-note">
    <strong>Lokaler Browser-Flow</strong>
    <span>
      Nova öffnet einen sichtbaren lokalen Browser. Du meldest dich beim Anbieter selbst an;
      Nova speichert danach nur die lokale Session mit restriktiven Dateiberechtigungen.
    </span>
  </div>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; gap: 2rem; align-items: end; padding: 1.5rem; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(135deg, rgba(119, 92, 255, 0.18), rgba(29, 201, 171, 0.08)); }
  .eyebrow { display: block; color: var(--accent-secondary); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.45rem; }
  h2 { margin: 0; font-size: clamp(1.65rem, 4vw, 2.4rem); }
  .hero p { margin: 0.6rem 0 0; color: var(--muted); max-width: 700px; line-height: 1.6; }
  .hero-stats { display: flex; gap: 0.55rem; }
  .hero-stats div { min-width: 92px; text-align: center; padding: 0.85rem; border-radius: 14px; background: rgba(12, 18, 32, 0.45); border: 1px solid var(--border); }
  .hero-stats strong, .hero-stats span { display: block; }
  .hero-stats strong { font-size: 1.55rem; }
  .hero-stats span { color: var(--muted); font-size: 0.68rem; }
  .toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 180px 190px; gap: 0.75rem; margin: 1rem 0; }
  .search { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.85rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  input, select { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); padding: 0 0.8rem; font: inherit; }
  .search input { border: 0; background: transparent; padding: 0; outline: 0; }
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 0.9rem; }
  .provider-card { display: flex; flex-direction: column; gap: 1rem; min-height: 285px; padding: 1.15rem; border: 1px solid var(--border); border-radius: 16px; background: var(--card-bg); transition: transform 0.16s ease, border-color 0.16s ease; }
  .provider-card:hover { transform: translateY(-2px); border-color: rgba(143, 122, 255, 0.65); }
  .provider-card.connected { border-color: rgba(67,217,163,0.35); }
  .provider-head { display: flex; gap: 0.8rem; align-items: center; }
  .provider-title { min-width: 0; flex: 1; }
  .provider-mark { display: grid; place-items: center; width: 44px; height: 44px; flex: 0 0 auto; border-radius: 13px; background: color-mix(in srgb, var(--provider-color) 22%, transparent); border: 1px solid color-mix(in srgb, var(--provider-color) 55%, transparent); color: var(--provider-color); font-weight: 800; font-size: 0.78rem; }
  h3 { margin: 0 0 0.2rem; font-size: 1rem; }
  .provider-head code { color: var(--muted); }
  .provider-card > p { margin: 0; color: var(--muted); line-height: 1.55; flex: 1; }
  .job-state { padding: 0.24rem 0.48rem; border-radius: 999px; background: rgba(145,160,184,0.1); color: var(--muted); font-size: 0.62rem; white-space: nowrap; }
  .job-state.running { color: #ffd166; background: rgba(255,209,102,0.1); }
  .job-state.success { color: var(--success); background: rgba(67,217,163,0.1); }
  .job-state.failed { color: var(--danger); background: rgba(255,111,133,0.1); }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .meta span { padding: 0.25rem 0.5rem; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--muted); font-size: 0.72rem; }
  .job-detail { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.65rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(6,10,20,0.4); }
  .job-detail.success { border-color: rgba(67,217,163,0.22); }
  .job-detail.failed { border-color: rgba(255,111,133,0.22); }
  .job-detail strong, .job-detail small { display: block; }
  .job-detail strong { font-size: 0.72rem; }
  .job-detail small { margin-top: 0.2rem; color: var(--muted); font-size: 0.66rem; }
  .job-dot { width: 8px; height: 8px; margin-top: 0.25rem; flex: 0 0 auto; border-radius: 50%; background: #748096; }
  .job-detail.success .job-dot { background: var(--success); }
  .job-detail.failed .job-dot { background: var(--danger); }
  .job-dot.spin { background: #ffd166; animation: pulse 1s infinite alternate; }
  @keyframes pulse { to { opacity: 0.35; transform: scale(0.72); } }
  .primary-action { min-height: 42px; border: 1px solid rgba(143,122,255,0.5); border-radius: 10px; background: linear-gradient(135deg, rgba(124,108,242,0.32), rgba(79,110,247,0.22)); color: var(--text); cursor: pointer; }
  .primary-action:disabled { opacity: 0.55; cursor: wait; }
  .command { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem; border-radius: 10px; background: rgba(6, 10, 20, 0.55); border: 1px solid var(--border); }
  .command code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: #c8d2e5; }
  .command button, .notice button { border: 0; border-radius: 8px; padding: 0.45rem 0.65rem; background: rgba(124, 108, 242, 0.22); color: var(--text); cursor: pointer; }
  .security-note, .empty, .notice { margin-top: 1rem; padding: 1rem 1.1rem; border: 1px dashed var(--border); border-radius: 13px; display: flex; gap: 0.6rem; flex-wrap: wrap; color: var(--muted); }
  .security-note strong, .empty strong, .notice strong { color: var(--text); }
  .notice.error { border-color: rgba(255,111,133,0.28); color: var(--danger); }
  @media (max-width: 760px) {
    .hero { align-items: start; flex-direction: column; }
    .hero-stats { width: 100%; }
    .hero-stats div { flex: 1; }
    .toolbar { grid-template-columns: 1fr; }
    .provider-grid { grid-template-columns: 1fr; }
  }
</style>
