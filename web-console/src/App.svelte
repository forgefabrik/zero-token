<script lang="ts">
  import { onMount } from "svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Playground from "./pages/PlaygroundStable.svelte";
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

  const PAGE_STORAGE_KEY = "nova.active-page";
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

  function isPageKey(value: string): value is PageKey {
    return navItems.some((item) => item.key === value);
  }

  function navigate(next: PageKey) {
    page = next;
    mobileNavOpen = false;
    window.localStorage.setItem(PAGE_STORAGE_KEY, next);
    history.replaceState(null, "", `#${next}`);
  }

  function syncFromHash() {
    const hash = location.hash.slice(1);
    if (isPageKey(hash)) {
      page = hash;
      window.localStorage.setItem(PAGE_STORAGE_KEY, hash);
    }
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
    const hash = location.hash.slice(1);
    const stored = window.localStorage.getItem(PAGE_STORAGE_KEY) ?? "";
    if (isPageKey(hash)) page = hash;
    else if (isPageKey(stored)) page = stored;
    history.replaceState(null, "", `#${page}`);

    void checkHealth();
    const timer = window.setInterval(checkHealth, 15_000);
    window.addEventListener("hashchange", syncFromHash);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("hashchange", syncFromHash);
    };
  });
</script>

<div class="app-shell">
  <aside class:open={mobileNavOpen} class="sidebar">
    <div class="brand">
      <div class="logo" aria-hidden="true">N</div>
      <div class="brand-copy">
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
          <span class="nav-marker" aria-hidden="true"></span>
        </button>
      {/each}
    </nav>

    <div class="sidebar-bottom">
      <div class="gateway-state">
        <span class:online={online === true} class:offline={online === false} class="state-dot"></span>
        <div>
          <strong>{online === null ? "Gateway wird geprüft" : online ? "Gateway online" : "Gateway offline"}</strong>
          <span>bkg.eysho.info · öffentliche API</span>
        </div>
      </div>
      <p>SELF-HOSTED CONTROL PLANE</p>
    </div>
  </aside>

  {#if mobileNavOpen}
    <button class="backdrop" onclick={() => (mobileNavOpen = false)} aria-label="Navigation schließen"></button>
  {/if}

  <main>
    <header class="topbar">
      <button class="menu-button" onclick={() => (mobileNavOpen = true)} aria-label="Navigation öffnen">☰</button>
      <div class="title-block">
        <span class="breadcrumb">{APP_NAME} / {activeItem.label}</span>
        <h1>{activeItem.label}</h1>
      </div>
      <div class="topbar-status">
        <span class="environment">PRODUCTION CONTROL</span>
        <button class="health-pill" onclick={checkHealth} title="Gateway-Status neu prüfen">
          <span class:online={online === true} class:offline={online === false} class="state-dot"></span>
          {online === null ? "Prüfen" : online ? "Online" : "Offline"}
        </button>
      </div>
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
  :global(html), :global(body), :global(#app) { width: 100%; height: 100%; overflow: hidden; }
  :global(html) { color-scheme: dark; background: #070a12; }
  :global(body) {
    margin: 0;
    min-width: 320px;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 78% -18%, rgba(255, 50, 165, 0.14), transparent 33%),
      radial-gradient(circle at 92% 34%, rgba(99, 214, 255, 0.09), transparent 28%),
      linear-gradient(145deg, #070a12 0%, #090e19 56%, #080b13 100%);
    color: #f4f7ff;
  }
  :global(body::before) {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.18;
    background-image:
      linear-gradient(rgba(126, 155, 198, 0.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(126, 155, 198, 0.04) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: linear-gradient(to bottom, black, transparent 78%);
  }
  :global(button), :global(input), :global(select), :global(textarea) { font: inherit; }
  :global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible), :global(textarea:focus-visible) { outline: 2px solid #66d8ff; outline-offset: 2px; }
  :global(code) { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; font-size: 0.82em; }
  :global(.muted) { color: var(--muted); }
  :global(.btn) { min-height: 38px; padding: 0 0.9rem; border: 1px solid var(--border); border-radius: 8px; background: rgba(255, 57, 166, 0.09); color: var(--text); cursor: pointer; transition: 0.16s ease; }
  :global(.btn:hover) { background: rgba(255, 57, 166, 0.16); border-color: rgba(255, 80, 179, 0.55); }
  :global(.btn:disabled) { opacity: 0.5; cursor: not-allowed; }
  :global(.card) { background: var(--card-bg); border: 1px solid var(--border); border-radius: 12px; }
  :root {
    --card-bg: rgba(14, 21, 34, 0.86);
    --surface: rgba(10, 16, 28, 0.94);
    --surface-2: rgba(18, 27, 43, 0.9);
    --border: rgba(145, 174, 214, 0.17);
    --border-strong: rgba(114, 210, 255, 0.34);
    --accent: #ff3ba7;
    --accent-secondary: #69d9ff;
    --accent-warm: #ff944d;
    --text: #f4f7ff;
    --muted: #8d9bb2;
    --success: #43d9a3;
    --danger: #ff6f85;
    --warning: #ffb35c;
  }

  .app-shell {
    position: relative;
    isolation: isolate;
    height: 100dvh;
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    overflow: hidden;
  }
  .app-shell::after {
    content: "";
    position: fixed;
    inset: 0 0 auto;
    height: 2px;
    z-index: 80;
    background: linear-gradient(90deg, var(--accent), var(--accent-warm) 48%, var(--accent-secondary));
    box-shadow: 0 0 20px rgba(255, 59, 167, 0.34);
  }
  .sidebar {
    position: relative;
    z-index: 30;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    padding: 0.85rem;
    overflow: hidden;
    background: linear-gradient(180deg, rgba(8, 12, 22, 0.97), rgba(9, 14, 25, 0.94));
    border-right: 1px solid var(--border);
    box-shadow: 18px 0 52px rgba(0, 0, 0, 0.22);
    backdrop-filter: blur(22px);
  }
  .brand { display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 0.7rem; padding: 0.35rem 0.35rem 0.85rem; }
  .logo {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    border: 1px solid rgba(105, 217, 255, 0.42);
    border-radius: 9px;
    background: linear-gradient(145deg, rgba(255, 59, 167, 0.92), rgba(120, 81, 255, 0.88) 54%, rgba(105, 217, 255, 0.88));
    box-shadow: 0 0 24px rgba(255, 59, 167, 0.2), inset 0 0 18px rgba(255, 255, 255, 0.13);
    font-weight: 900;
    letter-spacing: -0.04em;
  }
  .brand-copy { min-width: 0; }
  .brand-copy strong, .brand-copy span { display: block; }
  .brand-copy strong { font-size: 0.88rem; letter-spacing: 0.025em; }
  .brand-copy span { margin-top: 0.12rem; overflow: hidden; color: var(--muted); font-size: 0.61rem; text-overflow: ellipsis; white-space: nowrap; }
  .close-nav { display: none; border: 0; background: transparent; color: var(--muted); font-size: 1.5rem; }
  nav { min-height: 0; display: grid; align-content: start; gap: 0.24rem; overflow: hidden; }
  nav button {
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 3px;
    align-items: center;
    gap: 0.62rem;
    width: 100%;
    min-height: 48px;
    padding: 0.5rem 0.55rem;
    overflow: hidden;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    text-align: left;
    cursor: pointer;
    transition: 0.16s ease;
  }
  nav button:hover { color: var(--text); background: rgba(105, 217, 255, 0.045); border-color: rgba(105, 217, 255, 0.12); }
  nav button.active {
    color: var(--text);
    background: linear-gradient(90deg, rgba(255, 59, 167, 0.12), rgba(105, 217, 255, 0.055));
    border-color: rgba(255, 82, 177, 0.25);
    box-shadow: inset 0 0 24px rgba(255, 59, 167, 0.035);
  }
  .nav-icon { display: grid; place-items: center; width: 28px; height: 28px; border: 1px solid rgba(145, 174, 214, 0.13); border-radius: 7px; background: rgba(255, 255, 255, 0.025); font-size: 0.72rem; }
  nav button.active .nav-icon { color: var(--accent-secondary); border-color: rgba(105, 217, 255, 0.28); background: rgba(105, 217, 255, 0.07); }
  .nav-copy { min-width: 0; }
  .nav-copy strong, .nav-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-copy strong { font-size: 0.78rem; font-weight: 650; }
  .nav-copy small { margin-top: 0.08rem; color: #617089; font-size: 0.61rem; }
  .nav-marker { width: 3px; height: 24px; border-radius: 999px; background: transparent; }
  nav button.active .nav-marker { background: linear-gradient(var(--accent), var(--accent-warm)); box-shadow: 0 0 12px rgba(255, 59, 167, 0.46); }
  .sidebar-bottom { padding-top: 0.7rem; }
  .gateway-state { display: grid; grid-template-columns: 8px minmax(0, 1fr); gap: 0.6rem; align-items: center; padding: 0.65rem; border: 1px solid var(--border); border-radius: 8px; background: rgba(255, 255, 255, 0.022); }
  .gateway-state strong, .gateway-state span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .gateway-state strong { font-size: 0.71rem; }
  .gateway-state span { margin-top: 0.1rem; color: var(--muted); font-size: 0.61rem; }
  .sidebar-bottom p { margin: 0.55rem 0.2rem 0; color: #4e5d75; font-size: 0.56rem; letter-spacing: 0.12em; }
  .state-dot { display: inline-block; width: 7px; height: 7px; flex: 0 0 auto; border-radius: 999px; background: #65748e; box-shadow: 0 0 0 4px rgba(101, 116, 142, 0.08); }
  .state-dot.online { background: var(--success); box-shadow: 0 0 0 4px rgba(67, 217, 163, 0.08), 0 0 14px rgba(67, 217, 163, 0.28); }
  .state-dot.offline { background: var(--danger); box-shadow: 0 0 0 4px rgba(255, 111, 133, 0.08), 0 0 14px rgba(255, 111, 133, 0.24); }

  main { min-width: 0; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; }
  .topbar {
    position: relative;
    z-index: 20;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.85rem;
    min-height: 74px;
    padding: 0.75rem clamp(1rem, 2.6vw, 2.25rem);
    background: rgba(7, 11, 19, 0.76);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(20px);
  }
  .title-block { min-width: 0; }
  .breadcrumb { display: block; color: var(--muted); font-size: 0.62rem; letter-spacing: 0.11em; text-transform: uppercase; }
  h1 { margin: 0.16rem 0 0; font-size: clamp(1.15rem, 2vw, 1.55rem); letter-spacing: -0.025em; }
  .menu-button { display: none; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); width: 38px; height: 38px; }
  .topbar-status { display: grid; grid-template-columns: auto auto; align-items: center; gap: 0.7rem; }
  .environment { color: #66748c; font-size: 0.57rem; letter-spacing: 0.12em; }
  .health-pill { display: inline-grid; grid-template-columns: 7px auto; align-items: center; gap: 0.48rem; min-height: 34px; padding: 0 0.7rem; border: 1px solid var(--border); border-radius: 999px; background: rgba(255, 255, 255, 0.025); color: var(--muted); cursor: pointer; font-size: 0.68rem; }
  .health-pill:hover { border-color: var(--border-strong); color: var(--text); }
  .content {
    min-width: 0;
    min-height: 0;
    width: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.1rem clamp(1rem, 2.6vw, 2.25rem) 2rem;
    scrollbar-width: none;
    overscroll-behavior: contain;
  }
  .content::-webkit-scrollbar { width: 0; height: 0; display: none; }
  .content > :global(*) { width: min(1540px, 100%); margin-inline: auto; }
  .content.playground { padding: 0; }
  .content.playground > :global(*) { width: 100%; max-width: none; }
  .backdrop { display: none; }

  @media (max-height: 780px) and (min-width: 901px) {
    .sidebar { padding-block: 0.65rem; }
    .brand { padding-bottom: 0.55rem; }
    nav { gap: 0.12rem; }
    nav button { min-height: 42px; padding-block: 0.35rem; }
    .nav-copy small { display: none; }
    .sidebar-bottom p { display: none; }
  }

  @media (max-width: 900px) {
    .app-shell { display: block; }
    .sidebar { position: fixed; inset: 0 auto 0 0; width: min(300px, 86vw); transform: translateX(-102%); transition: transform 0.2s ease; box-shadow: 28px 0 70px rgba(0, 0, 0, 0.46); }
    .sidebar.open { transform: translateX(0); }
    .close-nav, .menu-button { display: block; }
    .backdrop { display: block; position: fixed; inset: 0; z-index: 25; border: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(2px); }
    main { height: 100dvh; }
    .environment { display: none; }
  }

  @media (max-width: 560px) {
    .topbar { min-height: 66px; padding-inline: 0.75rem; }
    .breadcrumb { display: none; }
    h1 { margin: 0; font-size: 1.1rem; }
    .content { padding: 0.8rem 0.75rem 1.4rem; }
  }
</style>
