<script lang="ts">
  import CandidateProbePanel from "./CandidateProbePanel.svelte";
  import type {
    CandidateProbeJob,
    DiscoveryControlState,
  } from "../lib/discovery-control";

  type Review = DiscoveryControlState["reviews"][number];

  let {
    review,
    probe,
    busy = false,
    onDecision,
    onProbeStart,
    onProbeStop,
  }: {
    review: Review;
    probe?: CandidateProbeJob;
    busy?: boolean;
    onDecision: (providerId: string, decision: string) => void | Promise<void>;
    onProbeStart: (providerId: string) => void | Promise<void>;
    onProbeStop: (probeId: string) => void | Promise<void>;
  } = $props();

  function label(value: string): string {
    switch (value) {
      case "account-required": return "Account nötig";
      case "approved": return "Freigegeben";
      case "account-ready": return "Account bereit";
      case "rejected": return "Abgelehnt";
      default: return "Neu";
    }
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }
</script>

<article class:valuable={review.valuable} class:rejected={review.decision === "rejected"}>
  <div class="head">
    <div class="score" style={`--score:${review.score * 3.6}deg`}><strong>{review.score}</strong></div>
    <div class="title">
      <h4>{review.label}</h4>
      <code>{review.providerId}</code>
    </div>
    <span class="decision decision-{review.decision}">{label(review.decision)}</span>
  </div>

  <div class="signals">
    <span class:yes={review.homepageReachable}>Webseite</span>
    <span class:yes={review.streamPotential}>HTML-Stream-Signal</span>
    <span class:yes={review.apiPotential}>HTML-API-Signal</span>
    <span class:alert={review.accountRequired}>Account {review.accountRequired ? "nötig" : "offen"}</span>
  </div>

  {#if review.models.length}
    <div class="models">
      {#each review.models.slice(0, 8) as model}<code>{model}</code>{/each}
      {#if review.models.length > 8}<span>+{review.models.length - 8}</span>{/if}
    </div>
  {/if}

  <ul>
    {#each review.reasons.slice(0, 5) as reason}<li>{reason}</li>{/each}
  </ul>

  <CandidateProbePanel
    providerId={review.providerId}
    {probe}
    {busy}
    enabled={Boolean(review.homepage)}
    onStart={onProbeStart}
    onStop={onProbeStop}
  />

  <div class="meta">Geprüft: {formatDate(review.lastCheckedAt)}</div>

  <div class="actions">
    {#if review.homepage}
      <a href={review.homepage} target="_blank" rel="noreferrer">Website öffnen ↗</a>
    {/if}
    {#if review.decision !== "approved"}
      <button class="approve" disabled={busy} onclick={() => onDecision(review.providerId, "approved")}>Lohnt sich</button>
    {/if}
    {#if review.accountRequired && review.decision !== "account-ready"}
      <button class="account" disabled={busy} onclick={() => onDecision(review.providerId, "account-ready")}>Account erstellt</button>
    {/if}
    {#if review.decision !== "rejected"}
      <button class="reject" disabled={busy} onclick={() => onDecision(review.providerId, "rejected")}>Ablehnen</button>
    {/if}
  </div>
</article>

<style>
  article { display: flex; flex-direction: column; gap: 0.75rem; min-height: 285px; padding: 1rem; border: 1px solid var(--border); border-radius: 15px; background: var(--card-bg); }
  article.valuable { border-color: rgba(67,217,163,0.28); }
  article.rejected { opacity: 0.62; }
  .head { display: flex; align-items: center; gap: 0.65rem; }
  .score { display: grid; place-items: center; width: 46px; height: 46px; flex: 0 0 auto; border-radius: 50%; background: conic-gradient(var(--success) var(--score), rgba(255,255,255,0.07) 0); position: relative; }
  .score::after { content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #121a2a; }
  .score strong { position: relative; z-index: 1; font-size: 0.72rem; }
  .title { min-width: 0; flex: 1; }
  h4 { margin: 0; font-size: 0.86rem; }
  .title code { display: block; margin-top: 0.18rem; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
  .decision { padding: 0.22rem 0.45rem; border-radius: 999px; background: rgba(145,160,184,0.1); color: var(--muted); font-size: 0.6rem; white-space: nowrap; }
  .decision-account-required { color: #ffd166; background: rgba(255,209,102,0.1); }
  .decision-approved, .decision-account-ready { color: var(--success); background: rgba(67,217,163,0.1); }
  .decision-rejected { color: var(--danger); background: rgba(255,111,133,0.1); }
  .signals, .models { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .signals span, .models code, .models > span { padding: 0.22rem 0.42rem; border: 1px solid var(--border); border-radius: 7px; color: #66758d; font-size: 0.62rem; }
  .signals span.yes { color: var(--success); border-color: rgba(67,217,163,0.22); background: rgba(67,217,163,0.05); }
  .signals span.alert { color: #ffd166; border-color: rgba(255,209,102,0.22); }
  .models code { color: #c7d0e2; background: rgba(5,9,17,0.42); }
  ul { display: grid; gap: 0.3rem; margin: 0; padding-left: 1rem; color: var(--muted); font-size: 0.67rem; line-height: 1.4; }
  .meta { margin-top: auto; color: #66758d; font-size: 0.62rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .actions a, .actions button { display: inline-flex; align-items: center; min-height: 34px; padding: 0 0.6rem; border: 1px solid var(--border); border-radius: 8px; background: rgba(255,255,255,0.035); color: var(--muted); font-size: 0.66rem; text-decoration: none; cursor: pointer; }
  .actions button:disabled { opacity: 0.5; cursor: wait; }
  .actions .approve { color: var(--success); border-color: rgba(67,217,163,0.24); }
  .actions .account { color: #ffd166; border-color: rgba(255,209,102,0.24); }
  .actions .reject { color: var(--danger); border-color: rgba(255,111,133,0.22); }
</style>
