<script lang="ts">
  import { onMount } from "svelte";
  import DiscoveryCandidateCard from "./DiscoveryCandidateCard.svelte";
  import {
    decideCandidate,
    getCandidateProbes,
    startCandidateProbe,
    stopCandidateProbe,
    type CandidateProbeJob,
    type DiscoveryControlState,
  } from "../lib/discovery-control";

  let {
    reviews,
    onChanged,
  }: {
    reviews: DiscoveryControlState["reviews"];
    onChanged: () => void | Promise<void>;
  } = $props();

  let probes = $state<CandidateProbeJob[]>([]);
  let query = $state("");
  let selected = $state<string | null>(null);
  let error = $state<string | null>(null);

  const visible = $derived(
    reviews.filter((review) => {
      const needle = query.trim().toLowerCase();
      return !needle || review.label.toLowerCase().includes(needle) || review.providerId.toLowerCase().includes(needle) || review.models.some((model) => model.toLowerCase().includes(needle));
    }),
  );
  const active = $derived(
    probes.filter((probe) => probe.status === "starting" || probe.status === "waiting-for-user").length,
  );

  onMount(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (active > 0) void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  });

  function latest(providerId: string): CandidateProbeJob | undefined {
    return probes.find((probe) => probe.providerId === providerId);
  }

  async function refresh() {
    try {
      probes = await getCandidateProbes();
      error = null;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Probe-Status nicht erreichbar";
    }
  }

  async function decide(providerId: string, decision: string) {
    selected = providerId;
    try {
      await decideCandidate(providerId, decision);
      await onChanged();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Entscheidung fehlgeschlagen";
    } finally {
      selected = null;
    }
  }

  async function start(providerId: string) {
    selected = providerId;
    try {
      const probe = await startCandidateProbe(providerId);
      probes = [probe, ...probes.filter((item) => item.id !== probe.id)];
      error = null;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Probe konnte nicht gestartet werden";
    } finally {
      selected = null;
    }
  }

  async function stop(probeId: string) {
    selected = probes.find((item) => item.id === probeId)?.providerId ?? null;
    try {
      const probe = await stopCandidateProbe(probeId);
      probes = [probe, ...probes.filter((item) => item.id !== probe.id)];
    } catch (reason) {
      error = reason instanceof Error ? reason.message : "Probe konnte nicht beendet werden";
    } finally {
      selected = null;
    }
  }
</script>

<section class="queue-head">
  <div><span>Review Queue</span><h3>Gefundene Quellen</h3></div>
  <div class="tools">
    {#if active > 0}<b>{active} Probe(n) aktiv</b>{/if}
    <input bind:value={query} placeholder="Kandidat oder Modell suchen" />
  </div>
</section>

{#if error}<div class="error">{error}</div>{/if}

{#if visible.length === 0}
  <div class="empty">Keine passenden Kandidaten. Starte einen Discovery-Lauf.</div>
{:else}
  <div class="cards">
    {#each visible as review (review.providerId)}
      <DiscoveryCandidateCard
        {review}
        probe={latest(review.providerId)}
        busy={selected === review.providerId}
        onDecision={decide}
        onProbeStart={start}
        onProbeStop={stop}
      />
    {/each}
  </div>
{/if}

<style>
  .queue-head { display:flex; justify-content:space-between; align-items:end; gap:1rem; margin:1rem 0 .65rem; }
  .queue-head span { color:var(--accent-secondary); text-transform:uppercase; letter-spacing:.12em; font-size:.68rem; font-weight:700; }
  h3 { margin:.28rem 0 0; font-size:1rem; }
  .tools { display:flex; align-items:center; gap:.6rem; }
  .tools b { color:#ffd166; font-size:.65rem; white-space:nowrap; }
  input { width:min(380px,100%); min-height:40px; padding:0 .7rem; border:1px solid var(--border); border-radius:9px; background:var(--surface); color:var(--text); }
  .cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:.75rem; }
  .error,.empty { padding:.8rem; border:1px dashed var(--border); border-radius:11px; color:var(--muted); font-size:.7rem; }
  .error { color:var(--danger); border-color:rgba(255,111,133,.3); }
  @media(max-width:650px){.queue-head,.tools{align-items:flex-start;flex-direction:column}.tools,input{width:100%}.cards{grid-template-columns:1fr}}
</style>
