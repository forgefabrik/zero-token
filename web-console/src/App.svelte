<script lang="ts">
  import { onMount } from "svelte";
  import Dashboard from "./pages/Dashboard.svelte";
  import Providers from "./pages/Providers.svelte";
  import Accounts from "./pages/Accounts.svelte";
  import Models from "./pages/Models.svelte";
  import Settings from "./pages/Settings.svelte";
  import Playground from "./pages/Playground.svelte";

<<<<<<< HEAD
  let page = $state("playground");

  type PageKey = "dashboard" | "accounts" | "models" | "settings" | "playground";

  const navItems: { key: PageKey; label: string }[] = [
    { key: "playground", label: "Playground" },
    { key: "dashboard", label: "Dashboard" },
    { key: "accounts", label: "Accounts" },
    { key: "models", label: "Modelle" },
    { key: "settings", label: "Einstellungen" },
=======
  type PageKey = "dashboard" | "providers" | "accounts" | "models" | "settings";

  const navItems: { key: PageKey; label: string; icon: string; description: string }[] = [
    { key: "dashboard", label: "Übersicht", icon: "◫", description: "Status und Schnellzugriff" },
    { key: "providers", label: "Provider", icon: "✦", description: "Anbieter verbinden" },
    { key: "accounts", label: "Accounts", icon: "◎", description: "Sessions verwalten" },
    { key: "models", label: "Modelle", icon: "◇", description: "Modelle durchsuchen" },
    { key: "settings", label: "Einstellungen", icon: "⚙", description: "Gateway und Konfiguration" },
>>>>>>> refs/remotes/origin/main
  ];

  let page = $state<PageKey>("dashboard");
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
      <div class="logo">ZT</div>
      <div>
        <strong>Zero Token</strong>
        <span>Local AI Gateway</span>
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

<<<<<<< HEAD
  <main class="main">
    {#if page !== "playground"}
      <div class="page-header">
        <h1>{navItems.find((n) => n.key === page)?.label ?? ""}</h1>
      </div>
    {/if}
    <div class="page-content" class:full={page === "playground"}>
      {#if page === "playground"}
        <Playground />
      {:else if page === "dashboard"}
=======
  {#if mobileNavOpen}
    <button class="backdrop" onclick={() => (mobileNavOpen = false)} aria-label="Navigation schließen"></button>
  {/if}

  <main>
    <header class="topbar">
      <button class="menu-button" onclick={() => (mobileNavOpen = true)} aria-label="Navigation öffnen">☰</button>
      <div>
        <span class="breadcrumb">Zero Token / {activeItem.label}</span>
        <h1>{activeItem.label}</h1>
      </div>
      <button class="health-pill" onclick={checkHealth} title="Gateway-Status neu prüfen">
        <span class:online={online === true} class:offline={online === false} class="state-dot"></span>
        {online === null ? "Prüfen" : online ? "Online" : "Offline"}
      </button>
    </header>

    <section class="content">
      {#if page === "dashboard"}
>>>>>>> refs/remotes/origin/main
        <Dashboard />
      {:else if page === "providers"}
        <Providers />
      {:else if page === "accounts"}
        <Accounts />
      {:else if page === "models"}
        <Models />
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
  :global(button), :global(input), :global(select) { font: inherit; }
  :global(button:focus-visible), :global(input:focus-visible), :global(select:focus-visible) { outline: 2px solid #8f7aff; outline-offset: 2px; }
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
  .logo { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: linear-gradient(145deg, #8f7aff, #4f6ef7); box-shadow: 0 10px 26px rgba(79, 110, 247, 0.24); font-size: 0.78rem; font-weight: 900; }
  .brand strong, .brand span { display: block; }
  .brand span { margin-top: 0.12rem; color: var(--muted); font-size: 0.72rem; }
  .close-nav { display: none; margin-left: auto; border: 0; background: transparent; color: var(--muted); font-size: 1.6rem; }
  nav { display: grid; gap: 0.35rem; }
  nav button { display: flex; align-items: center; gap: 0.75rem; width: 100%; padding: 0.72rem; border: 1px solid transparent; border-radius: 12px; background: transparent; color: var(--muted); text-align: left; cursor: pointer; transition: 0.16s ease; }
  nav button:hover { color: var(--text); background: rgba(255,255,255,0.035); }
  nav button.active { color: var(--text); background: rgba(124, 108, 242, 0.13); border-color: rgba(143, 122, 255, 0.24); }
  .nav-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: rgba(255,255,255,0.04); font-size: 0.9rem; }
  .nav-copy strong, .nav-copy small { display: block; }
  .nav-copy strong { font-size: 0.86rem; }
  .nav-copy small { margin-top: 0.12rem; color: #65748e; font-size: 0.68rem; }
  .sidebar-bottom { margin-top: auto; }
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
  .backdrop { display: none; }

<<<<<<< HEAD
  :global(h1, h2, h3, h4) {
    font-family: "Outfit", "Inter", system-ui, sans-serif;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  :global(code) {
    font-family: "SF Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.85em;
  }

  :global(.muted) {
    color: #8a7a9e;
  }

  :global(.btn) {
    font-family: "Inter", system-ui, sans-serif;
    padding: 0.5rem 1.2rem;
    border: 1px solid rgba(164, 144, 194, 0.3);
    background: rgba(74, 78, 143, 0.2);
    color: #e6e6fa;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.15s, border-color 0.15s;
  }

  :global(.btn:hover) {
    background: rgba(74, 78, 143, 0.4);
    border-color: #a490c2;
  }

  :global(.btn:disabled) {
    opacity: 0.5;
    cursor: default;
  }

  :global(.card) {
    background: rgba(43, 30, 62, 0.6);
    border: 1px solid rgba(74, 78, 143, 0.3);
    border-radius: 10px;
    padding: 1.25rem;
  }

  :global(a) {
    color: #a490c2;
    text-decoration: none;
  }

  :global(a:hover) {
    color: #e6e6fa;
  }

  :root {
    --card-bg: rgba(43, 30, 62, 0.6);
    --border: rgba(74, 78, 143, 0.3);
    --accent: #4a4e8f;
    --accent-secondary: #a490c2;
    --text: #e6e6fa;
    --muted: #8a7a9e;
  }

  .layout {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 220px;
    background: #2b1e3e;
    border-right: 1px solid rgba(74, 78, 143, 0.25);
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    margin-bottom: 2rem;
  }

  .brand-icon {
    font-size: 1.4rem;
    color: #a490c2;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-name {
    font-family: "Outfit", system-ui, sans-serif;
    font-weight: 600;
    font-size: 1.05rem;
  }

  .brand-ver {
    font-size: 0.7rem;
    color: #8a7a9e;
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .nav-item {
    font-family: "Inter", system-ui, sans-serif;
    text-align: left;
    padding: 0.6rem 0.8rem;
    border: none;
    background: transparent;
    color: #8a7a9e;
    border-radius: 8px;
    cursor: pointer;
    font-size: 0.875rem;
    transition: background 0.15s, color 0.15s;
  }

  .nav-item:hover {
    background: rgba(74, 78, 143, 0.2);
    color: #e6e6fa;
  }

  .nav-item.active {
    background: rgba(74, 78, 143, 0.35);
    color: #e6e6fa;
    font-weight: 500;
  }

  .sidebar-footer {
    margin-top: auto;
    padding-top: 1rem;
  }

  .disclaimer-small {
    font-size: 0.65rem;
    color: rgba(138, 122, 158, 0.5);
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
  }

  .page-header {
    padding: 1.5rem 2rem 0 2rem;
  }

  .page-header h1 {
    font-size: 1.35rem;
    font-weight: 600;
    margin: 0;
  }

  .page-content {
    padding: 0 2rem 2rem 2rem;
    flex: 1;
  }

  .page-content.full {
    padding: 0;
    display: flex;
    flex-direction: column;
  }

  .float-disclaimer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    padding: 0.4rem;
    font-size: 0.65rem;
    color: rgba(138, 122, 158, 0.4);
    background: rgba(26, 20, 35, 0.85);
    backdrop-filter: blur(4px);
    pointer-events: none;
=======
  @media (max-width: 900px) {
    .app-shell { display: block; }
    .sidebar { position: fixed; left: 0; transform: translateX(-102%); width: min(310px, 86vw); transition: transform 0.2s ease; box-shadow: 24px 0 60px rgba(0,0,0,0.35); }
    .sidebar.open { transform: translateX(0); }
    .close-nav, .menu-button { display: block; }
    .backdrop { display: block; position: fixed; inset: 0; z-index: 25; border: 0; background: rgba(0,0,0,0.5); }
    .topbar { min-height: 76px; }
>>>>>>> refs/remotes/origin/main
  }
</style>
