<script lang="ts">
  import { onMount } from "svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Playground from "./pages/Playground.svelte";
  import Providers from "./pages/Providers.svelte";
  import Discovery from "./pages/Discovery.svelte";
  import Agent from "./pages/Agent.svelte";
  import GenericAgent from "./pages/GenericAgent.svelte";
  import Accounts from "./pages/Accounts.svelte";
  import Models from "./pages/Models.svelte";
  import Logs from "./pages/Logs.svelte";
  import Settings from "./pages/Settings.svelte";
  import { APP_NAME, APP_TAGLINE, APP_VERSION } from "./lib/brand";

  type PageKey =
    | "playground"
    | "dashboard"
    | "providers"
    | "discovery"
    | "agent"
    | "genericagent"
    | "accounts"
    | "models"
    | "logs"
    | "settings";

  const navItems: { key: PageKey; label: string; icon: string; description: string }[] = [
    { key: "playground", label: "Playground", icon: "▶", description: "Modelle direkt testen" },
    { key: "dashboard", label: "Übersicht", icon: "◫", description: "Status und Schnellzugriff" },
    { key: "providers", label: "Provider", icon: "✦", description: "Anbieter verbinden" },
    { key: "discovery", label: "Discovery", icon: "⌕", description: "Neue Provider finden" },
    { key: "agent", label: "yoyo Agent", icon: "⌁", description: "Coding-Agent starten" },
    { key: "genericagent", label: "GenericAgent", icon: "GA", description: "Externes Agent-Backend" },
    { key: "accounts", label: "Accounts", icon: "◎", description: "Sessions verwalten" },
    { key: "models", label: "Modelle", icon: "◇", description: "Modelle durchsuchen" },
    { key: "logs", label: "Live-Logs", icon: "≋", description: "Ereignisse beobachten" },
    { key: "settings", label: "Einstellungen", icon: "⚙", description: "Gateway und Konfiguration" },
  ];

  let page = $state<PageKey>("playground");
  let mobileNavOpen = $state(false);
  let online = $state<boolean | null>(null);

  const activeItem = $derived(navItems.find((item) => item.key === page) ?? navItems[0]);

  function navigate(next: PageKey) {
    page = next;
    mobileNavOpen = false;
    history.replaceState(null, "", `#${next}`);
  }

  async function checkHealth() {
    try {
      const response = await fetch("/health", { cache: "no-store" });
      online = response.ok;
    } catch {
      online = false;
    }
  }

  onMount(() => {
    const hash = location.hash.slice(1) as PageKey;
    if (navItems.some((item) => item.key === hash)) page = hash;
    void checkHealth();
    const timer = window.setInterval(checkHealth, 15_000);
    return () => window.clearInterval(timer);
  });
</script>

<div class="app-shell">
  <aside class:open={mobileNavOpen} class="sidebar">
    <div class="brand">
      <div class="logo">N</div>
      <div>
        <strong>{APP_NAME}</strong>
        <span>{APP_TAGLINE} · v{APP_VERSION}</span>
      </div>
      <button class="close-nav" onclick={() => (mobileNavOpen = false)} aria-label="Navigation schließen">×</button>
    </div>

    <nav aria-label="Hauptnavigation">
      {#each navItems as item}
        <button
          class:active={page === item.key}
          onclick={() => navigate(item.key)}
          aria-current={page === item.key ? "page" : undefined}
        >
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-copy">
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
        </button>
      {/each}
    </nav>

    <div class="sidebar-bottom">
      <div class="gateway-state">
        <span class:online={online === true} class:offline={online === false} class="state-dot"></span>
        <div>
          <strong>{online === null ? "Prüfe Gateway" : online ? "Gateway online" : "Gateway offline"}</strong>
          <span>127.0.0.1 · lokal</span>
        </div>
      </div>
      <p>Inoffiziell · experimentell · lokal</p>
    </div>
  </aside>

  {#if mobileNavOpen}
    <button class="backdrop" onclick={() => (mobileNavOpen = false)} aria-label="Navigation schließen"></button>
  {/if}

  <main>
    <header class="topbar">
      <button class="menu-button" onclick={() => (mobileNavOpen = true)} aria-label="Navigation öffnen">☰</button>
      <div>
        <span class="breadcrumb">{APP_NAME} / {activeItem.label}</span>
        <h1>{activeItem.label}</h1>
      </div>
      <button class="health-pill" onclick={checkHealth} title="Gateway-Status neu prüfen">
        <span class:online={online === true} class:offline={online === false} class="state-dot"></span>
        {online === null ? "Prüfen" : online ? "Online" : "Offline"}
      </button>
    </header>

    <section class="content" class:playground={page === "playground"}>
      {#if page === "playground"}
        <Playground />
      {:else if page === "dashboard"}
        <Dashboard />
      {:else if page === "providers"}
        <Providers />
      {:else if page === "discovery"}
        <Discovery />
      {:else if page === "agent"}
        <Agent />
      {:else if page === "genericagent"}
        <GenericAgent />
      {:else if page === "accounts"}
        <Accounts />
      {:else if page === "models"}
        <Models />
      {:else if page === "logs"}
        <Logs />
      {:else if page === "settings"}
        <Settings />
      {/if}
    </section>
  </main>
</div>

<style>
  :global(*) { box-sizing: border-box; }
  :global(html) { color-scheme: dark; background: #080d18; }
  :global(body) { margin: 0; min-width: 320px; min-height: 100vh; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 70% -10%, rgba(102, 77, 255, 0.15), transparent 34%), #080d18; color: #edf1f8; }
  :global(button), :global(input), :global(select), :global(textarea) { font: inherit; }
  :global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) { outline: 2px solid #8f7aff; outline-offset: 2px; }
  :global(code) { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 0.82em; }
  :global(.muted) { color: var(--muted); }
  :global(.btn) { min-height: 40px; padding: 0 0.95rem; border: 1px solid var(--border); border-radius: 10px; background: rgba(124, 108, 242, 0.14); color: var(--text); cursor: pointer; transition: 0.16s ease; }
  :global(.btn:hover) { background: rgba(124, 108, 242, 0.25); border-color: rgba(143, 122, 255, 0.68); }
  :global(.btn:disabled) { opacity: 0.5; cursor: not-allowed; }
  :global(.card) { background: var(--card-bg); border: 1px solid var(--border); border-radius: 16px; }
  :root { --card-bg: rgba(19, 28, 46, 0.82); --surface: rgba(13, 20, 34, 0.92); --border: rgba(151, 166, 196, 0.18); --accent: #8f7aff; --accent-secondary: #9d8cff; --text: #edf1f8; --muted: #91a0b8; --success: #43d9a3; --danger: #ff6f85; }

  .app-shell { min-height: 100vh; display: grid; grid-template-columns: 260px minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; height: 100vh; z-index: 30; display: flex; flex-direction: column; padding: 1rem; background: rgba(9, 14, 25, 0.94); border-right: 1px solid var(--border); backdrop-filter: blur(18px); }
  .brand { display: flex; align-items: center; gap: 0.75rem; padding: 0.4rem 0.35rem 1.25rem; }
  .logo { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(145deg, #8f7aff, #43d9a3); box-shadow: 0 10px 26px rgba(79, 110, 247, 0.24); font-size: 1rem; font-weight: 900; }
  .brand strong, .brand span { display: block; }
  .brand span { margin-top: 0.12rem; color: var(--muted); font-size: 0.66rem; }
  .close-nav { display: none; margin-left: auto; border: 0; background: transparent; color: var(--muted); font-size: 1.6rem; }
  nav { display: grid; gap: 0.35rem; overflow-y: auto; }
  nav button { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.72rem; border: 1px solid transparent; border-radius: 12px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; transition: 0.16s ease; }
  nav button:hover { color: var(--text); background: rgba(255,255,255,0.035); }
  nav button.active { color: var(--text); background: rgba(124, 108, 242, 0.13); border-color: rgba(143, 122, 255, 0.24); }
  .nav-icon { display: grid; place-items: center; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 9px; background: rgba(255,255,255,0.04); font-size: 0.8rem; }
  .nav-copy strong, .nav-copy small { display: block; }
  .nav-copy strong { font-size: 0.86rem; }
  .nav-copy small { margin-top: 0.12rem; color: #65748e; font-size: 0.68rem; }
  .sidebar-bottom { margin-top: auto; padding-top: 0.8rem; }
  .gateway-state { display: flex; gap: 0.65rem; align-items: center; padding: 0.75rem; border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,0.025); }
  .gateway-state strong, .gateway-state span { display: block; }
  .gateway-state strong { font-size: 0.78rem; }
  .gateway-state span { margin-top: 0.12rem; color: var(--muted); font-size: 0.68rem; }
  .sidebar-bottom p { margin: 0.75rem 0.2rem 0; color: #526078; font-size: 0.65rem; }
  .state-dot { display: inline-block; width: 8px; height: 8px; flex: 0 0 auto; border-radius: 999px; background: #65748e; box-shadow: 0 0 0 4px rgba(101, 116, 142, 0.1); }
  .state-dot.online { background: var(--success); box-shadow: 0 0 0 4px rgba(67, 217, 163, 0.1); }
  .state-dot.offline { background: var(--danger); box-shadow: 0 0 0 4px rgba(255, 111, 133, 0.1); }
  main { min-width: 0; }
  .topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 0.85rem; min-height: 88px; padding: 1rem clamp(1rem, 3vw, 2.5rem); background: rgba(8, 13, 24, 0.78); border-bottom: 1px solid var(--border); backdrop-filter: blur(18px); }
  .topbar > div { flex: 1; }
  .breadcrumb { color: var(--muted); font-size: 0.72rem; }
  h1 { margin: 0.18rem 0 0; font-size: clamp(1.3rem, 3vw, 1.75rem); letter-spacing: -0.025em; }
  .menu-button { display: none; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); width: 40px; height: 40px; }
  .health-pill { display: inline-flex; align-items: center; gap: 0.5rem; min-height: 36px; padding: 0 0.75rem; border: 1px solid var(--border); border-radius: 999px; background: rgba(255,255,255,0.03); color: var(--muted); cursor: pointer; font-size: 0.75rem; }
  .content { width: min(1480px, 100%); margin: 0 auto; padding: 1.4rem clamp(1rem, 3vw, 2.5rem) 3rem; }
  .content.playground { width: 100%; max-width: none; padding: 0; }
  .backdrop { display: none; }

  @media (max-width: 900px) {
    .app-shell { display: block; }
    .sidebar { position: fixed; left: 0; transform: translateX(-102%); width: min(310px, 86vw); transition: transform 0.2s ease; box-shadow: 24px 0 60px rgba(0,0,0,0.35); }
    .sidebar.open { transform: translateX(0); }
    .close-nav, .menu-button { display: block; }
    .backdrop { display: block; position: fixed; inset: 0; z-index: 25; border: 0; background: rgba(0,0,0,0.5); }
    .topbar { min-height: 76px; }
  }
</style>
