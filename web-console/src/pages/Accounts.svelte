<script lang="ts">
  import type { Account, SessionValidationResult } from "../lib/api";
  import { listAccounts, validateAccount, deleteAccount } from "../lib/api";

  let accounts = $state<Account[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let validating = $state<string | null>(null);
  let deleting = $state<string | null>(null);
  let notification = $state<{ type: string; message: string } | null>(null);

  $effect(() => {
    load();
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
      await validateAccount(id);
      showNotification("erfolg", "Account validiert");
      await load();
    } catch (err) {
      showNotification("fehler", err instanceof Error ? err.message : "Fehler");
    } finally {
      validating = null;
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Account wirklich entfernen?")) return;
    deleting = id;
    try {
      await deleteAccount(id);
      showNotification("erfolg", "Account entfernt");
      await load();
    } catch (err) {
      showNotification("fehler", err instanceof Error ? err.message : "Fehler");
    } finally {
      deleting = null;
    }
  }

  function showNotification(type: string, message: string) {
    notification = { type, message };
    setTimeout(() => { notification = null; }, 4000);
  }
</script>

<div class="page">
  <div class="header">
    <h2>Accounts</h2>
    <button class="btn" onclick={load}>Aktualisieren</button>
  </div>

  {#if notification}
    <div class="toast {notification.type}">{notification.message}</div>
  {/if}

  {#if loading}
    <p class="muted">Lade Accounts …</p>
  {:else if error}
    <div class="card warn"><p>{error}</p></div>
  {:else if accounts.length === 0}
    <div class="card empty">
      <p>Keine Accounts gespeichert.</p>
      <p class="muted">Verwende <code>zt login</code> im Terminal, um einen Account hinzuzufügen.</p>
    </div>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Provider</th>
            <th>Status</th>
            <th>Plan</th>
            <th>Priorität</th>
            <th>Zuletzt genutzt</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each accounts as acc}
            <tr class={acc.enabled ? "" : "disabled"}>
              <td>{acc.label}</td>
              <td><span class="badge">{acc.provider}</span></td>
              <td>
                <span class="status-dot status-{acc.sessionStatus}"></span>
                {acc.sessionStatus}
              </td>
              <td>{acc.plan ?? "–"}</td>
              <td>{acc.priority}</td>
              <td class="muted">{acc.lastUsedAt ? new Date(acc.lastUsedAt).toLocaleDateString("de-DE") : "–"}</td>
              <td class="actions">
                <button
                  class="btn-sm"
                  onclick={() => handleValidate(acc.id)}
                  disabled={validating === acc.id}
                >
                  {validating === acc.id ? "…" : "Validieren"}
                </button>
                <button
                  class="btn-sm btn-danger"
                  onclick={() => handleDelete(acc.id)}
                  disabled={deleting === acc.id}
                >
                  {deleting === acc.id ? "…" : "Entfernen"}
                </button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page { padding: 1rem 0; }
  h2 { margin: 0; }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
  }
  .toast {
    padding: 0.6rem 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
    font-size: 0.875rem;
  }
  .toast.erfolg { background: rgba(122, 237, 159, 0.15); color: #7bed9f; border: 1px solid rgba(122, 237, 159, 0.3); }
  .toast.fehler { background: rgba(255, 107, 107, 0.15); color: #ff6b6b; border: 1px solid rgba(255, 107, 107, 0.3); }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  th {
    text-align: left;
    padding: 0.75rem 1rem;
    color: var(--muted);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.75rem;
    border-bottom: 1px solid var(--border);
    background: var(--card-bg);
  }
  td {
    padding: 0.65rem 1rem;
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td { border-bottom: none; }
  tr.disabled td { opacity: 0.45; }
  .badge {
    background: var(--accent);
    color: #fff;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
  }
  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 0.35rem;
  }
  .status-valid { background: #7bed9f; }
  .status-expired { background: #ff6b6b; }
  .status-error { background: #ffa502; }
  .status-unknown { background: var(--muted); }
  .actions {
    display: flex;
    gap: 0.4rem;
  }
  .btn-sm {
    padding: 0.3rem 0.6rem;
    font-size: 0.75rem;
    border-radius: 5px;
    border: 1px solid var(--border);
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
  }
  .btn-sm:hover { border-color: var(--accent); }
  .btn-danger:hover { border-color: #ff6b6b; color: #ff6b6b; }
  .btn-sm:disabled { opacity: 0.5; cursor: default; }
  .card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.5rem;
  }
  .card code {
    background: rgba(255,255,255,0.06);
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }
  .empty p { margin: 0.25rem 0; }
</style>
