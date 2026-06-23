<script lang="ts">
  import { PROVIDERS, providerLoginCommand } from "../lib/providers";

  let query = $state("");
  let region = $state<"all" | "global" | "china">("all");
  let authType = $state<"all" | "web-login" | "api-key">("all");
  let copied = $state<string | null>(null);

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
      <span class="eyebrow">Onboarding</span>
      <h2>Provider verbinden</h2>
      <p>Wähle einen Anbieter und kopiere den passenden lokalen Login- oder Konfigurationsbefehl.</p>
    </div>
    <div class="hero-stat">
      <strong>{PROVIDERS.length}</strong>
      <span>Provider</span>
    </div>
  </section>

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
      <article class="provider-card">
        <div class="provider-head">
          <div class="provider-mark" style={`--provider-color:${provider.color}`}>
            {provider.shortLabel.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <h3>{provider.label}</h3>
            <code>{provider.id}</code>
          </div>
        </div>

        <p>{provider.description}</p>

        <div class="meta">
          <span>{provider.authType === "web-login" ? "Browser-Login" : "API-Key"}</span>
          <span>{provider.region === "global" ? "Global" : "China"}</span>
          {#if provider.plan}<span>{provider.plan}</span>{/if}
        </div>

        <div class="command">
          <code>{providerLoginCommand(provider)}</code>
          <button onclick={() => copyCommand(provider.id)} aria-label={`Befehl für ${provider.label} kopieren`}>
            {copied === provider.id ? "Kopiert" : "Kopieren"}
          </button>
        </div>
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
    <strong>Lokale Sicherheit</strong>
    <span>Passwörter werden nicht in der Web-Konsole erfasst. Browser-Login und API-Schlüssel bleiben lokal.</span>
  </div>
</div>

<style>
  .page { padding: 0.5rem 0 2rem; }
  .hero { display: flex; justify-content: space-between; gap: 2rem; align-items: end; padding: 1.5rem; border: 1px solid var(--border); border-radius: 18px; background: linear-gradient(135deg, rgba(119, 92, 255, 0.18), rgba(29, 201, 171, 0.08)); }
  .eyebrow { display: block; color: var(--accent-secondary); font-size: 0.72rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 0.45rem; }
  h2 { margin: 0; font-size: clamp(1.65rem, 4vw, 2.4rem); }
  .hero p { margin: 0.6rem 0 0; color: var(--muted); max-width: 620px; line-height: 1.6; }
  .hero-stat { min-width: 96px; text-align: center; padding: 1rem; border-radius: 14px; background: rgba(12, 18, 32, 0.45); border: 1px solid var(--border); }
  .hero-stat strong { display: block; font-size: 2rem; }
  .hero-stat span { color: var(--muted); font-size: 0.78rem; }
  .toolbar { display: grid; grid-template-columns: minmax(220px, 1fr) 180px 190px; gap: 0.75rem; margin: 1rem 0; }
  .search { display: flex; align-items: center; gap: 0.55rem; padding: 0 0.85rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); }
  input, select { width: 100%; min-height: 42px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); padding: 0 0.8rem; font: inherit; }
  .search input { border: 0; background: transparent; padding: 0; outline: 0; }
  .provider-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(290px, 1fr)); gap: 0.9rem; }
  .provider-card { display: flex; flex-direction: column; gap: 1rem; min-height: 260px; padding: 1.15rem; border: 1px solid var(--border); border-radius: 16px; background: var(--card-bg); transition: transform 0.16s ease, border-color 0.16s ease; }
  .provider-card:hover { transform: translateY(-2px); border-color: rgba(143, 122, 255, 0.65); }
  .provider-head { display: flex; gap: 0.8rem; align-items: center; }
  .provider-mark { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 13px; background: color-mix(in srgb, var(--provider-color) 22%, transparent); border: 1px solid color-mix(in srgb, var(--provider-color) 55%, transparent); color: var(--provider-color); font-weight: 800; font-size: 0.78rem; }
  h3 { margin: 0 0 0.2rem; font-size: 1rem; }
  .provider-head code { color: var(--muted); }
  .provider-card > p { margin: 0; color: var(--muted); line-height: 1.55; flex: 1; }
  .meta { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .meta span { padding: 0.25rem 0.5rem; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--border); color: var(--muted); font-size: 0.72rem; }
  .command { display: flex; align-items: center; gap: 0.5rem; padding: 0.55rem; border-radius: 10px; background: rgba(6, 10, 20, 0.55); border: 1px solid var(--border); }
  .command code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: #c8d2e5; }
  .command button { border: 0; border-radius: 8px; padding: 0.45rem 0.65rem; background: rgba(124, 108, 242, 0.22); color: var(--text); cursor: pointer; }
  .security-note, .empty { margin-top: 1rem; padding: 1rem 1.1rem; border: 1px dashed var(--border); border-radius: 13px; display: flex; gap: 0.6rem; flex-wrap: wrap; color: var(--muted); }
  .security-note strong, .empty strong { color: var(--text); }
  @media (max-width: 760px) {
    .hero { align-items: start; }
    .hero-stat { display: none; }
    .toolbar { grid-template-columns: 1fr; }
    .provider-grid { grid-template-columns: 1fr; }
  }
</style>
