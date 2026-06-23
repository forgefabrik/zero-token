<script lang="ts">
  let page = $state("dashboard");
</script>

<div class="container">
  <header>
    <h1>Zero Token</h1>
    <p class="subtitle">Inoffizielles, experimentelles lokales Werkzeug – Kein OpenAI-Produkt.</p>
  </header>

  <nav>
    <button onclick={() => (page = "dashboard")}>Dashboard</button>
    <button onclick={() => (page = "accounts")}>Accounts</button>
    <button onclick={() => (page = "models")}>Modelle</button>
    <button onclick={() => (page = "settings")}>Einstellungen</button>
  </nav>

  <main>
    {#if page === "dashboard"}
      <section>
        <h2>Dashboard</h2>
        <p>Gateway-Status, aktive Accounts, Modell-Cache – wird in PR 9 implementiert.</p>
      </section>
    {:else if page === "accounts"}
      <section>
        <h2>ChatGPT Plus Accounts</h2>
        <p>Account-Verwaltung – wird in PR 3 und PR 9 implementiert.</p>
      </section>
    {:else if page === "models"}
      <section>
        <h2>Modelle</h2>
        <p>Verfügbare Chatmodelle – wird in PR 4 implementiert.</p>
      </section>
    {:else if page === "settings"}
      <section>
        <h2>Einstellungen</h2>
        <p>Gateway-Konfiguration, Proxy, Log-Level – wird in PR 9 implementiert.</p>
      </section>
    {/if}
  </main>

  <footer>
    <p class="disclaimer">
      HINWEIS: Dies ist ein inoffizielles, experimentelles lokales Werkzeug.<br />
      Es ist kein OpenAI-Produkt und steht in keinem Zusammenhang mit OpenAI.
    </p>
  </footer>
</div>

<style>
  .container {
    font-family: system-ui, -apple-system, sans-serif;
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem;
  }

  header h1 {
    margin: 0;
    font-size: 1.75rem;
  }

  .subtitle {
    color: #666;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  nav {
    display: flex;
    gap: 0.5rem;
    margin: 1.5rem 0;
    flex-wrap: wrap;
  }

  nav button {
    padding: 0.5rem 1rem;
    border: 1px solid #ccc;
    background: #f5f5f5;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.875rem;
  }

  nav button:hover {
    background: #e5e5e5;
  }

  main {
    min-height: 20rem;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 1.5rem;
  }

  footer {
    margin-top: 2rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }

  .disclaimer {
    font-size: 0.75rem;
    color: #999;
    text-align: center;
  }
</style>
