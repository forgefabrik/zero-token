<script lang="ts">
  import type { CandidateProbeJob } from "../lib/discovery-control";

  let {
    providerId,
    probe,
    busy = false,
    enabled = true,
    onStart,
    onStop,
  }: {
    providerId: string;
    probe?: CandidateProbeJob;
    busy?: boolean;
    enabled?: boolean;
    onStart: (providerId: string) => void | Promise<void>;
    onStop: (probeId: string) => void | Promise<void>;
  } = $props();

  const active = $derived(
    probe?.status === "starting" || probe?.status === "waiting-for-user",
  );

  function statusLabel(): string {
    switch (probe?.status) {
      case "starting": return "Browser startet";
      case "waiting-for-user": return "Testnachricht senden";
      case "completed": return "Probe abgeschlossen";
      case "cancelled": return "Probe beendet";
      case "failed": return "Probe fehlgeschlagen";
      default: return "Noch nicht getestet";
    }
  }
</script>

<section class:active class:verified={probe?.streamObserved} class="probe">
  <div class="head">
    <div>
      <strong>{statusLabel()}</strong>
      <small>{probe?.message ?? "Sichtbarer Browser-Test mit ausschließlich technischen Metadaten."}</small>
    </div>
    {#if probe}<span>{probe.requestCount} Ereignisse</span>{/if}
  </div>

  {#if probe}
    <div class="signals">
      <span class:yes={probe.apiObserved}>API beobachtet</span>
      <span class:yes={probe.streamObserved}>Stream beobachtet</span>
    </div>
    {#if probe.error}<p>{probe.error}</p>{/if}
    {#if probe.evidence.length}
      <div class="evidence">
        {#each probe.evidence.filter((item) => item.apiSignal || item.streamSignal).slice(0, 4) as item}
          <div>
            <span>{item.method} · {item.resourceType}{item.status ? ` · ${item.status}` : ""}</span>
            <code>{item.url}</code>
            {#if item.contentType}<small>{item.contentType}</small>{/if}
          </div>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="actions">
    {#if active && probe}
      <button class="stop" disabled={busy} onclick={() => onStop(probe.id)}>Probe stoppen</button>
    {:else}
      <button disabled={busy || !enabled} onclick={() => onStart(providerId)}>Sichtbaren Stream-Test starten</button>
    {/if}
  </div>
</section>

<style>
  .probe { display:grid; gap:.55rem; padding:.7rem; border:1px solid var(--border); border-radius:11px; background:rgba(5,9,17,.34); }
  .probe.active { border-color:rgba(255,209,102,.3); }
  .probe.verified { border-color:rgba(67,217,163,.35); background:rgba(67,217,163,.04); }
  .head { display:flex; justify-content:space-between; gap:.6rem; }
  .head strong,.head small { display:block; }
  .head strong { font-size:.72rem; }
  .head small { margin-top:.18rem; color:var(--muted); line-height:1.4; font-size:.62rem; }
  .head>span { color:var(--muted); font-size:.6rem; white-space:nowrap; }
  .signals { display:flex; flex-wrap:wrap; gap:.35rem; }
  .signals span { padding:.22rem .42rem; border:1px solid var(--border); border-radius:7px; color:#66758d; font-size:.62rem; }
  .signals span.yes { color:var(--success); border-color:rgba(67,217,163,.22); }
  p { margin:0; color:var(--danger); font-size:.64rem; }
  .evidence { display:grid; gap:.35rem; }
  .evidence div { min-width:0; padding:.4rem; border:1px solid rgba(151,166,196,.1); border-radius:8px; }
  .evidence span,.evidence code,.evidence small { display:block; }
  .evidence span,.evidence small { color:#6f7f98; font-size:.58rem; }
  .evidence code { margin:.15rem 0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#c8d2e5; font-size:.6rem; }
  .actions { display:flex; justify-content:flex-end; }
  button { min-height:34px; padding:0 .65rem; border:1px solid rgba(143,122,255,.32); border-radius:8px; background:rgba(124,108,242,.12); color:var(--accent-secondary); cursor:pointer; }
  button.stop { color:var(--danger); border-color:rgba(255,111,133,.25); background:rgba(255,111,133,.08); }
  button:disabled { opacity:.5; cursor:wait; }
</style>
