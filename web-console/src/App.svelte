<script lang="ts">
  import Dashboard from "./pages/Dashboard.svelte";
  import Accounts from "./pages/Accounts.svelte";
  import Models from "./pages/Models.svelte";
  import Settings from "./pages/Settings.svelte";

  let page = $state("dashboard");

  type PageKey = "dashboard" | "accounts" | "models" | "settings";

  const navItems: { key: PageKey; label: string }[] = [
    { key: "dashboard", label: "Dashboard" },
    { key: "accounts", label: "Accounts" },
    { key: "models", label: "Modelle" },
    { key: "settings", label: "Einstellungen" },
  ];
</script>

<div class="layout">
  <aside class="sidebar">
    <div class="brand">
      <div class="brand-icon">✦</div>
      <div class="brand-text">
        <span class="brand-name">Zero Token</span>
        <span class="brand-ver">v0.1.0</span>
      </div>
    </div>

    <nav class="nav">
      {#each navItems as item}
        <button
          class="nav-item"
          class:active={page === item.key}
          onclick={() => (page = item.key)}
        >
          {item.label}
        </button>
      {/each}
    </nav>

    <div class="sidebar-footer">
      <span class="disclaimer-small">Inoffiziell · Experimentell</span>
    </div>
  </aside>

  <main class="main">
    <div class="page-header">
      <h1>{navItems.find((n) => n.key === page)?.label ?? ""}</h1>
    </div>
    <div class="page-content">
      {#if page === "dashboard"}
        <Dashboard />
      {:else if page === "accounts"}
        <Accounts />
      {:else if page === "models"}
        <Models />
      {:else if page === "settings"}
        <Settings />
      {/if}
    </div>
  </main>
</div>

<div class="float-disclaimer">
  <span>
    ✦ Zero Token v0.1.0 – Inoffizielles, experimentelles lokales Werkzeug. Kein OpenAI-Produkt.
  </span>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }

  :global(body) {
    font-family: "Inter", system-ui, -apple-system, sans-serif;
    background: #1a1423;
    color: #e6e6fa;
    min-height: 100vh;
  }

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
  }
</style>
