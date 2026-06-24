<script lang="ts">
  import type { DiscoveryControlState } from "../lib/discovery-control";

  let {
    state,
    busy = false,
    onRun,
    onSave,
  }: {
    state: DiscoveryControlState;
    busy?: boolean;
    onRun: () => void | Promise<void>;
    onSave: (config: DiscoveryControlState["config"]) => void | Promise<void>;
  } = $props();

  let draft = $state({ ...state.config, sources: [...state.config.sources] });
  let sourcesText = $state(state.config.sources.join("\n"));
  let saving = $state(false);

  $effect(() => {
    draft = { ...state.config, sources: [...state.config.sources] };
    sourcesText = state.config.sources.join("\n");
  });

  async function save() {
    saving = true;
    try {
      await onSave({
        ...draft,
        sources: sourcesText
          .split(/[\n,]/)
          .map((value) => value.trim())
          .filter(Boolean),
      });
    } finally {
      saving = false;
    }
  }

  function formatDate(value?: string): string {
    if (!value) return "–";
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
</script>

<section class="panel">
  <div class="head">
    <div>
      <span class="eyebrow">Autonomous Discovery</span>
      <h3>Steuerung</h3>
    </div>
    <span class:online={state.config.enabled} class="state">
      <i></i>{state.config.enabled ? "Aktiv" : "Pausiert"}
    </span>
  </div>

  <div class="toggles">
    <label>
      <input type="checkbox" bind:checked={draft.enabled} />
      <span><strong>Automatisch suchen</strong><small>Scheduler aktivieren</small></span>
    </label>
    <label>
      <input type="checkbox" bind:checked={draft.runOnStart} />
      <span><strong>Beim Start suchen</strong><small>Direkt nach Gateway-Start</small></span>
    </label>
    <label>
      <input type="checkbox" bind:checked={draft.inspectHomepages} />
      <span><strong>Webseiten prüfen</strong><small>Nur öffentliche HTTPS-Ziele</small></span>
    </label>
    <label>
      <input type="checkbox" bind:checked={draft.notifyOnAccountRequired} />
      <span><strong>Account-Hinweise</strong><small>Lohnenswerte Logins markieren</small></span>
    </label>
  </div>

  <div class="fields">
    <label>
      <span>Intervall</span>
      <select bind:value={draft.intervalMinutes}>
        <option value={30}>30 Minuten</option>
        <option value={60}>1 Stunde</option>
        <option value={180}>3 Stunden</option>
        <option value={360}>6 Stunden</option>
        <option value={720}>12 Stunden</option>
        <option value={1440}>24 Stunden</option>
        <option value={10080}>7 Tage</option>
      </select>
    </label>
    <label>
      <span>Mindestscore: {draft.minScore}</span>
      <input type="range" min="0" max="100" step="5" bind:value={draft.minScore} />
    </label>
  </div>

  <label class="sources">
    <span>Manifest-Quellen</span>
    <textarea
      bind:value={sourcesText}
      rows="4"
      placeholder="https://raw.githubusercontent.com/OWNER/REPO/main/providers.json"
    ></textarea>
    <small>Eine URL pro Zeile. Nur HTTPS über raw.githubusercontent.com.</small>
  </label>

  <div class="schedule">
    <div>
      <span>Letzter Lauf</span><strong>{formatDate(state.lastRunAt)}</strong>
    </div>
    <div>
      <span>Nächster Lauf</span><strong>{formatDate(state.nextRunAt)}</strong>
    </div>
  </div>

  <div class="actions">
    <button class="secondary" onclick={save} disabled={saving}>{saving ? "Speichert …" : "Speichern"}</button>
    <button class="primary" onclick={onRun} disabled={busy || state.running}>
      {busy || state.running ? "Discovery läuft …" : "Jetzt suchen"}
    </button>
  </div>
</section>

<style>
  .panel { padding: 1rem; border: 1px solid var(--border); border-radius: 16px; background: var(--card-bg); }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: start; }
  .eyebrow { display: block; color: var(--accent-secondary); text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.68rem; font-weight: 700; }
  h3 { margin: 0.3rem 0 0; font-size: 1rem; }
  .state { display: inline-flex; align-items: center; gap: 0.45rem; color: var(--muted); font-size: 0.68rem; }
  .state i { width: 8px; height: 8px; border-radius: 50%; background: #748096; }
  .state.online i { background: var(--success); box-shadow: 0 0 0 4px rgba(67,217,163,0.1); }
  .toggles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.55rem; margin: 0.9rem 0; }
  .toggles label { display: flex; gap: 0.55rem; align-items: flex-start; padding: 0.65rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(5,9,17,0.28); }
  .toggles input { margin-top: 0.18rem; accent-color: var(--accent); }
  .toggles strong, .toggles small { display: block; }
  .toggles strong { font-size: 0.72rem; }
  .toggles small { margin-top: 0.18rem; color: var(--muted); font-size: 0.64rem; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem; }
  .fields label, .sources { display: grid; gap: 0.35rem; color: var(--muted); font-size: 0.7rem; }
  select, input[type="range"], textarea { width: 100%; border: 1px solid var(--border); border-radius: 9px; background: var(--surface); color: var(--text); }
  select, input[type="range"] { min-height: 40px; padding: 0 0.65rem; }
  input[type="range"] { accent-color: var(--accent); }
  .sources { margin-top: 0.7rem; }
  textarea { resize: vertical; padding: 0.65rem; font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.67rem; }
  .sources small { color: #66758d; }
  .schedule { display: grid; grid-template-columns: 1fr 1fr; gap: 0.55rem; margin-top: 0.7rem; }
  .schedule div { padding: 0.6rem; border: 1px solid var(--border); border-radius: 9px; }
  .schedule span, .schedule strong { display: block; }
  .schedule span { color: var(--muted); font-size: 0.62rem; }
  .schedule strong { margin-top: 0.2rem; font-size: 0.7rem; }
  .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.75rem; }
  button { min-height: 38px; padding: 0 0.8rem; border-radius: 9px; color: var(--text); cursor: pointer; }
  button:disabled { opacity: 0.55; cursor: wait; }
  .secondary { border: 1px solid var(--border); background: rgba(255,255,255,0.035); }
  .primary { border: 0; background: linear-gradient(135deg, #7c6cf2, #536ff5); }
  @media (max-width: 650px) { .toggles, .fields, .schedule { grid-template-columns: 1fr; } }
</style>
