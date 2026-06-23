<script lang="ts">
  import type { Account } from "../lib/api";
  import { deleteAccount, listAccounts, validateAccount } from "../lib/api";
  import { getProviderMeta, providerLoginCommand } from "../lib/providers";

  let accounts = $state<Account[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let validating = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let notification = $state<{ type: "success" | "error"; message: string } | null>(null);
  let query = $state("");
  let statusFilter = $state("all");
  let providerFilter = $state("all");

  const providers = $derived([...new Set(accounts.map((account) => account.provider))].sort());
  const filteredAccounts = $derived(
    accounts.filter((account) => {
      const needle = query.trim().toLowerCase();
      const provider = getProviderMeta(account.provider);
      const matchesQuery =
        !needle ||
        account.label.toLowerCase().includes(needle) ||
        account.provider.toLowerCase().includes(needle) ||
        account.email?.toLowerCase().includes(needle) ||
        provider?.label.toLowerCase().includes(needle);
      return (
        matchesQuery &&
        (statusFilter === "all" || account.sessionStatus === statusFilter) &&
        (providerFilter === "all" || account.provider === providerFilter)
      );
    }),
  );
  const validCount = $derived(accounts.filter((account) => account.sessionStatus === "valid").length);

  $effect(() => {
    void load();
  });

  async function load() {
    loading = true;
    error = null;
    try {
      accounts = await listAccounts();
    } catch (err) {
      error = err instanceof Error ? err.message : "Fehler beim Laden";
    } finally {
      loading = false;
    }
  }

  async function handleValidate(id: string) {
    validating = id;
    try {
      const result = await validateAccount(id);
      showNotification(
        result.valid ? "success" : "error",
        result.valid ? "Session ist gültig." : result.error ?? "Session ist ungültig.",
      );
      await load();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Validierung fehlgeschlagen");
    } finally {
      validating = null;
    }
  }

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Account „${label}“ wirklich entfernen?`)) return;
    deleting = id;
    try {
      await deleteAccount(id);
      showNotification("success", "Account wurde entfernt.");
      await load();
    } catch (err) {
      showNotification("error", err instanceof Error ? err.message : "Entfernen fehlgeschlagen");
    } finally {
      deleting = null;
    }
  }

  async function copyLoginCommand(providerId = "chatgpt-web") {
    const provider = getProviderMeta(providerId) ?? getProviderMeta("chatgpt-web");
    if (!provider) return;
    await navigator.clipboard.writeText(providerLoginCommand(provider));
    showNotification("success", "Login-Befehl kopiert.");
  }

  function showNotification(type: "success" | "error", message: string) {
    notification = { type, message };
    window.setTimeout(() => {
      notification = null;
    }, 3500);
  }

  function formatDate(value?: string) {
    if (!value) return "Noch nie";
    return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
      new Date(value),
    );
  }
</script>

<div class="page">
  <section class="summary">
    <div>
      <span class="eyebrow">Session-Verwaltung</span>
      <h2>Accounts</h2>
      <p>Konten prüfen, filtern und sicher entfernen. Sessiondaten werden hier niemals angezeigt.</p>
    </div>
    <div class="summary-stats">
      <div><strong>{accounts.length}</strong><span>Gesamt</span></div>
      <div><strong>{validCount}</strong><span>Gültig</span></div>
    </div>
  </section>

  <div class="actions-bar">
    <button class="btn primary" onclick={() => copyLoginCommand()}>Login-Befehl kopieren</button>
    <button class="btn" onclick={load} disabled={loading}>{loading ? "Lädt …" : "Aktualisieren"}</button>
  </div>

  {#if notification}
    <div class="toast {notification.type}" role="status">{notification.message}</div>
  {/if}

  {#if loading}
    <div class="skeleton-grid" aria-label="Accounts werden geladen">
      {#each Array(3) as _}<div class="skeleton"></div>{/each}
    </div>
  {:else if error}
    <div class="state-card error-state">
      <strong>Gateway nicht erreichbar</strong>
      <span>{error}</span>
      <button class="btn" onclick={load}>Erneut versuchen</button>
    </div>
  {:else if accounts.length === 0}
    <div class="state-card empty-state">
      <div class="empty-icon">◎</div>
      <strong>Noch keine Accounts</strong>
      <span>Verbinde zuerst einen Provider über einen lokalen Login-Befehl.</span>
      <button class="btn primary" onclick={() => copyLoginCommand()}>ChatGPT-Login kopieren</button>
    </div>
  {:else}
    <section class="filters" aria-label="Accounts filtern">
      <label class="search">
        <span>⌕</span>
        <input bind:value={query} placeholder="Account, E-Mail oder Provider suchen" aria-label="Accounts suchen" />
      </label>
      <select bind:value={providerFilter} aria-label="Provider filtern">
        <option value="all">Alle Provider</option>
        {#each providers as provider}<option value={provider}>{getProviderMeta(provider)?.label ?? provider}</option>{/each}
      </select>
      <select bind:value={statusFilter} aria-label="Status filtern">
        <option value="all">Alle Status</option>
        <option value="valid">Gültig</option>
        <option value="expired">Abgelaufen</option>
        <option value="login-required">Login nötig</option>
        <option value="error">Fehler</option>
        <option value="unknown">Unbekannt</option>
      </select>
    </section>

    {#if filteredAccounts.length === 0}
      <div class="state-card"><strong>Keine Treffer</strong><span>Ändere Suche oder Filter.</span></div>
    {:else}
      <div class="account-list">
        {#each filteredAccounts as account}
          {@const provider = getProviderMeta(account.provider)}
          <article class:disabled={!account.enabled} class="account-card">
            <div class="account-main">
              <div class="provider-mark" style={`--provider-color:${provider?.color ?? "#8f7aff"}`}>
                {(provider?.shortLabel ?? account.provider).slice(0, 2).toUpperCase()}
              </div>
              <div class="account-copy">
                <div class="title-line">
                  <h3>{account.label}</h3>
                  <span class="status status-{account.sessionStatus}">{account.sessionStatus}</span>
                </div>
                <span>{provider?.label ?? account.provider}{account.email ? ` · ${account.email}` : ""}</span>
              </div>
            </div>

            <dl>
              <div><dt>Plan</dt><dd>{account.plan ?? "Unbekannt"}</dd></div>
              <div><dt>Priorität</dt><dd>{account.priority}</dd></div>
              <div><dt>Validiert</dt><dd>{formatDate(account.lastValidatedAt)}</dd></div>
              <div><dt>Zuletzt genutzt</dt><dd>{formatDate(account.lastUsedAt)}</dd></div>
            </dl>

            <div class="card-actions">
              <button class="btn" onclick={() => handleValidate(account.id)} disabled={validating === account.id}>
                {validating === account.id ? "Prüfe …" : "Session prüfen"}
              </button>
              <button class="danger" onclick={() => handleDelete(account.id, account.label)} disabled={deleting === account.id}>
                {deleting === account.id ? "Entfernt …" : "Entfernen"}
              </button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .summary { display: flex; justify-content: space-between; align-items: end; gap: 1.5rem; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.7rem; font-weight: 700; }
  h2 { margin: 0.35rem 0 0; font-size: clamp(1.65rem, 4vw, 2.35rem); }
  .summary p { margin: 0.55rem 0 0; max-width: 650px; color: var(--muted); line-height: 1.55; }
  .summary-stats { display: flex; gap: 0.6rem; }
  .summary-stats div { min-width: 84px; padding: 0.75rem; border: 1px solid var(--border); border-radius: 13px; background: var(--card-bg); text-align: center; }
  .summary-stats strong, .summary-stats span { display: block; }
  .summary-stats strong { font-size: 1.35rem; }
  .summary-stats span { margin-top: 0.1rem; color: var(--muted); font-size: 0.7rem; }
  .actions-bar { display: flex; justify-content: flex-end; gap: 0.6rem; margin: 1rem 0; }
  .primary { background: linear-gradient(135deg, #7c6cf2, #5d75f7); border-color: transparent; }
  .filters { display: grid; grid-template-columns: minmax(260px, 1fr) 210px 180px; gap: 0.7rem; margin-bottom: 0.9rem; }
  .search { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.8rem; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); }
  input, select { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: 11px; background: var(--surface); color: var(--text); padding: 0 0.75rem; }
  .search input { border: 0; background: transparent; padding: 0; outline: 0; }
  .account-list { display: grid; gap: 0.75rem; }
  .account-card { display: grid; grid-template-columns: minmax(240px, 1.2fr) minmax(360px, 2fr) auto; gap: 1rem; align-items: center; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); }
  .account-card.disabled { opacity: 0.55; }
  .account-main { display: flex; align-items: center; gap: 0.75rem; min-width: 0; }
  .provider-mark { display: grid; place-items: center; width: 42px; height: 42px; flex: 0 0 auto; border-radius: 12px; background: color-mix(in srgb, var(--provider-color) 20%, transparent); border: 1px solid color-mix(in srgb, var(--provider-color) 50%, transparent); color: var(--provider-color); font-weight: 800; font-size: 0.75rem; }
  .account-copy { min-width: 0; }
  .title-line { display: flex; align-items: center; gap: 0.55rem; }
  h3 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.96rem; }
  .account-copy > span { display: block; margin-top: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 0.75rem; }
  .status { padding: 0.18rem 0.45rem; border-radius: 999px; font-size: 0.66rem; text-transform: capitalize; background: rgba(145,160,184,0.12); color: var(--muted); }
  .status-valid { color: var(--success); background: rgba(67,217,163,0.11); }
  .status-expired, .status-error, .status-login-required { color: var(--danger); background: rgba(255,111,133,0.11); }
  dl { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.6rem; margin: 0; }
  dl div { min-width: 0; }
  dt { color: var(--muted); font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.06em; }
  dd { margin: 0.22rem 0 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.76rem; }
  .card-actions { display: flex; gap: 0.5rem; }
  .danger { min-height: 40px; padding: 0 0.8rem; border: 1px solid rgba(255,111,133,0.28); border-radius: 10px; background: rgba(255,111,133,0.08); color: #ff8798; cursor: pointer; }
  .danger:disabled { opacity: 0.5; }
  .toast { margin-bottom: 0.8rem; padding: 0.75rem 0.9rem; border-radius: 11px; border: 1px solid var(--border); }
  .toast.success { color: var(--success); background: rgba(67,217,163,0.08); }
  .toast.error { color: var(--danger); background: rgba(255,111,133,0.08); }
  .state-card { display: grid; justify-items: start; gap: 0.55rem; padding: 1.3rem; border: 1px dashed var(--border); border-radius: 15px; color: var(--muted); background: rgba(255,255,255,0.018); }
  .state-card strong { color: var(--text); }
  .empty-state { justify-items: center; text-align: center; padding: 3rem 1rem; }
  .empty-icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 16px; background: rgba(124,108,242,0.12); color: var(--accent); font-size: 1.4rem; }
  .skeleton-grid { display: grid; gap: 0.75rem; }
  .skeleton { height: 92px; border-radius: 15px; background: linear-gradient(90deg, rgba(255,255,255,0.03), rgba(255,255,255,0.07), rgba(255,255,255,0.03)); background-size: 200% 100%; animation: shimmer 1.2s infinite; }
  @keyframes shimmer { to { background-position: -200% 0; } }
  @media (max-width: 1080px) {
    .account-card { grid-template-columns: 1fr; }
    dl { grid-template-columns: repeat(2, 1fr); }
    .card-actions { justify-content: flex-end; }
  }
  @media (max-width: 760px) {
    .summary-stats { display: none; }
    .actions-bar { justify-content: stretch; }
    .actions-bar .btn { flex: 1; }
    .filters { grid-template-columns: 1fr; }
    dl { grid-template-columns: 1fr 1fr; }
    .card-actions { display: grid; grid-template-columns: 1fr 1fr; }
  }
</style>
