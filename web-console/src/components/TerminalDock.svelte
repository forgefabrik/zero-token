<script lang="ts">
  import { onMount, tick } from "svelte";

  type DockTab = "cli" | "logs" | "jobs";
  type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

  type LogEvent = {
    id: number;
    time: string;
    level: LogLevel;
    name?: string;
    message: string;
    context?: Record<string, unknown>;
  };

  type LoginJob = {
    id: string;
    providerId: string;
    status: string;
    message?: string;
    accountLabel?: string;
    failureReason?: string;
  };

  type CliLine = {
    id: number;
    kind: "command" | "output" | "error" | "system";
    text: string;
  };

  type DockSettings = {
    open: boolean;
    tab: DockTab;
    height: number;
  };

  const STORAGE_KEY = "nova.terminal-dock";
  const MIN_HEIGHT = 180;
  const MAX_HEIGHT = 560;

  let open = $state(false);
  let activeTab = $state<DockTab>("cli");
  let height = $state(300);
  let logs = $state<LogEvent[]>([]);
  let jobs = $state<LoginJob[]>([]);
  let command = $state("");
  let cliLines = $state<CliLine[]>([
    { id: 1, kind: "system", text: "Nova Control Terminal bereit. 'help' zeigt verfügbare Befehle." },
  ]);
  let commandHistory = $state<string[]>([]);
  let historyIndex = $state(-1);
  let nextLineId = 2;
  let outputElement: HTMLDivElement | null = null;
  let eventSource: EventSource | null = null;
  let jobsTimer: number | undefined;

  const errorCount = $derived(logs.filter((entry) => entry.level === "error" || entry.level === "fatal").length);
  const runningJobs = $derived(jobs.filter((job) => ["starting", "waiting-for-user", "saving"].includes(job.status)).length);

  onMount(() => {
    restoreSettings();
    connectLogs();
    void refreshJobs();
    jobsTimer = window.setInterval(refreshJobs, 3_000);

    return () => {
      eventSource?.close();
      if (jobsTimer !== undefined) window.clearInterval(jobsTimer);
    };
  });

  function restoreSettings(): void {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<DockSettings>;
      open = stored.open === true;
      activeTab = stored.tab === "logs" || stored.tab === "jobs" ? stored.tab : "cli";
      height = clampHeight(Number(stored.height) || 300);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }

  function persistSettings(): void {
    const settings: DockSettings = { open, tab: activeTab, height };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function clampHeight(value: number): number {
    const viewportMaximum = typeof window === "undefined" ? MAX_HEIGHT : Math.max(MIN_HEIGHT, window.innerHeight - 150);
    return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, viewportMaximum, Math.round(value)));
  }

  function toggleDock(): void {
    open = !open;
    persistSettings();
    if (open) void scrollOutputToEnd();
  }

  function selectTab(tab: DockTab): void {
    activeTab = tab;
    open = true;
    persistSettings();
    void scrollOutputToEnd();
  }

  function startResize(event: PointerEvent): void {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;

    const move = (moveEvent: PointerEvent) => {
      height = clampHeight(startHeight + startY - moveEvent.clientY);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      persistSettings();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }

  function connectLogs(): void {
    eventSource?.close();
    eventSource = new EventSource("/api/logs/stream?tail=120");
    eventSource.addEventListener("log", (event) => {
      try {
        const entry = JSON.parse((event as MessageEvent<string>).data) as LogEvent;
        if (!logs.some((existing) => existing.id === entry.id)) {
          logs = [...logs.slice(-249), entry];
          if (open && activeTab === "logs") void scrollOutputToEnd();
        }
      } catch {
        // Ignore malformed stream records without breaking the terminal.
      }
    });
  }

  async function refreshJobs(): Promise<void> {
    try {
      const response = await fetch("/api/discovery/logins", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { jobs?: LoginJob[] };
      jobs = body.jobs ?? [];
    } catch {
      // The dock remains usable while the gateway reconnects.
    }
  }

  async function scrollOutputToEnd(): Promise<void> {
    await tick();
    if (outputElement) outputElement.scrollTop = outputElement.scrollHeight;
  }

  function addCliLine(kind: CliLine["kind"], text: string): void {
    cliLines = [...cliLines.slice(-149), { id: nextLineId++, kind, text }];
    void scrollOutputToEnd();
  }

  function formatJson(value: unknown): string {
    return JSON.stringify(value, null, 2);
  }

  async function requestJson(path: string, options?: RequestInit): Promise<unknown> {
    const response = await fetch(path, { cache: "no-store", ...options });
    const body = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : `HTTP ${response.status}`);
    return body;
  }

  async function executeCommand(rawCommand: string): Promise<void> {
    const normalized = rawCommand.trim();
    if (!normalized) return;

    addCliLine("command", `nova> ${normalized}`);
    commandHistory = [...commandHistory.filter((item) => item !== normalized), normalized].slice(-50);
    historyIndex = -1;
    command = "";

    const [name, ...args] = normalized.split(/\s+/);
    const argument = args.join(" ").toLowerCase();

    try {
      switch (name.toLowerCase()) {
        case "help":
          addCliLine("output", [
            "help               Befehle anzeigen",
            "status             Gateway-Status",
            "providers          Provider-Runtime",
            "models             Modellkatalog",
            "accounts           gespeicherte Accounts",
            "jobs               Login-Jobs",
            "logs               letzte Logs",
            "logs clear         Logs leeren",
            "refresh            Logs und Jobs aktualisieren",
            "clear              Terminalausgabe leeren",
          ].join("\n"));
          break;
        case "status":
          addCliLine("output", formatJson(await requestJson("/api/status")));
          break;
        case "providers":
          addCliLine("output", formatJson(await requestJson("/api/provider-runtime")));
          break;
        case "models":
          addCliLine("output", formatJson(await requestJson("/api/models")));
          break;
        case "accounts":
          addCliLine("output", formatJson(await requestJson("/api/accounts")));
          break;
        case "jobs":
          await refreshJobs();
          addCliLine("output", formatJson(jobs));
          break;
        case "logs":
          if (argument === "clear") {
            await requestJson("/api/logs", { method: "DELETE" });
            logs = [];
            addCliLine("system", "Live-Logs wurden geleert.");
          } else {
            addCliLine("output", formatJson(await requestJson("/api/logs?limit=50")));
          }
          break;
        case "refresh":
          connectLogs();
          await refreshJobs();
          addCliLine("system", "Terminaldaten wurden synchronisiert.");
          break;
        case "clear":
          cliLines = [];
          break;
        default:
          addCliLine("error", `Unbekannter Befehl: ${name}. Mit 'help' werden alle Befehle angezeigt.`);
      }
    } catch (error) {
      addCliLine("error", error instanceof Error ? error.message : String(error));
    }
  }

  function handleCommandKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void executeCommand(command);
      return;
    }

    if (event.key === "ArrowUp" && commandHistory.length > 0) {
      event.preventDefault();
      const nextIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
      historyIndex = nextIndex;
      command = commandHistory[commandHistory.length - 1 - nextIndex] ?? command;
    }

    if (event.key === "ArrowDown" && historyIndex >= 0) {
      event.preventDefault();
      const nextIndex = historyIndex - 1;
      historyIndex = nextIndex;
      command = nextIndex < 0 ? "" : commandHistory[commandHistory.length - 1 - nextIndex] ?? "";
    }
  }

  function contextPreview(context?: Record<string, unknown>): string {
    if (!context || Object.keys(context).length === 0) return "";
    return JSON.stringify(context);
  }
</script>

<section class:open class="terminal-dock" style={`--dock-height:${height}px`} aria-label="Nova Terminal">
  {#if open}
    <button class="resize-handle" onpointerdown={startResize} aria-label="Terminalhöhe ändern" title="Terminalhöhe ändern">
      <span></span>
    </button>
  {/if}

  <header class="dock-bar">
    <button class="dock-toggle" onclick={toggleDock} aria-expanded={open} title={open ? "Terminal einklappen" : "Terminal ausklappen"}>
      <span class="terminal-icon">›_</span>
      <strong>TERMINAL</strong>
      <span class="toggle-arrow">{open ? "⌄" : "⌃"}</span>
    </button>

    <nav aria-label="Terminalbereiche">
      <button class:active={activeTab === "cli"} onclick={() => selectTab("cli")}>CLI</button>
      <button class:active={activeTab === "logs"} onclick={() => selectTab("logs")}>LOGS <span>{logs.length}</span></button>
      <button class:active={activeTab === "jobs"} onclick={() => selectTab("jobs")}>JOBS <span>{runningJobs || jobs.length}</span></button>
    </nav>

    <div class="dock-health">
      {#if errorCount > 0}<span class="error-count">{errorCount} ERR</span>{/if}
      <span class="stream-state"><i></i>LIVE</span>
    </div>
  </header>

  {#if open}
    <div class="terminal-body">
      {#if activeTab === "cli"}
        <div class="terminal-output" bind:this={outputElement} aria-live="polite">
          {#each cliLines as line (line.id)}
            <pre class={line.kind}>{line.text}</pre>
          {/each}
        </div>
        <label class="command-line">
          <span>nova@control:~$</span>
          <input bind:value={command} onkeydown={handleCommandKey} autocomplete="off" spellcheck="false" aria-label="Nova CLI-Befehl" autofocus />
        </label>
      {:else if activeTab === "logs"}
        <div class="terminal-output log-output" bind:this={outputElement} aria-live="polite">
          {#each logs as entry (entry.id)}
            <div class={`log-line ${entry.level}`}>
              <time>{new Date(entry.time).toLocaleTimeString("de-DE")}</time>
              <span class="level">{entry.level.toUpperCase()}</span>
              <span class="source">{entry.name ?? "nova"}</span>
              <span class="message">{entry.message}</span>
              {#if contextPreview(entry.context)}<code>{contextPreview(entry.context)}</code>{/if}
            </div>
          {:else}
            <p class="empty">Noch keine Log-Ereignisse empfangen.</p>
          {/each}
        </div>
      {:else}
        <div class="terminal-output job-output" bind:this={outputElement}>
          <div class="job-header"><span>PROVIDER</span><span>STATUS</span><span>ACCOUNT</span><span>MELDUNG</span></div>
          {#each jobs as job (job.id)}
            <div class="job-line">
              <strong>{job.providerId}</strong>
              <span class={`job-status ${job.status}`}>{job.status}</span>
              <span>{job.accountLabel ?? "—"}</span>
              <span>{job.message ?? job.failureReason ?? "—"}</span>
            </div>
          {:else}
            <p class="empty">Keine Login-Jobs vorhanden.</p>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  .terminal-dock {
    position: relative;
    min-width: 0;
    height: 36px;
    overflow: hidden;
    border-top: 1px solid rgba(105, 217, 255, 0.19);
    background: rgba(5, 8, 14, 0.97);
    box-shadow: 0 -10px 34px rgba(0, 0, 0, 0.2);
    transition: height 0.2s ease;
  }
  .terminal-dock.open { height: var(--dock-height); }
  .resize-handle {
    position: absolute;
    inset: 0 0 auto;
    z-index: 4;
    display: grid;
    place-items: center;
    width: 100%;
    height: 7px;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: ns-resize;
  }
  .resize-handle span { width: 48px; height: 2px; border-radius: 99px; background: rgba(105, 217, 255, 0.28); }
  .resize-handle:hover span { background: var(--accent-secondary); box-shadow: 0 0 10px rgba(105, 217, 255, 0.35); }
  .dock-bar {
    height: 36px;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    padding: 0 0.72rem;
    border-bottom: 1px solid rgba(145, 174, 214, 0.1);
    background: linear-gradient(90deg, rgba(255, 59, 167, 0.055), transparent 34%, rgba(105, 217, 255, 0.035));
  }
  button { font: inherit; }
  .dock-toggle {
    display: inline-grid;
    grid-template-columns: auto auto auto;
    align-items: center;
    gap: 0.45rem;
    height: 28px;
    padding: 0 0.38rem;
    border: 0;
    background: transparent;
    color: #d9e4f5;
    cursor: pointer;
  }
  .terminal-icon { color: var(--accent-secondary); font-family: "SFMono-Regular", Consolas, monospace; font-size: 0.72rem; }
  .dock-toggle strong { font-size: 0.58rem; letter-spacing: 0.13em; }
  .toggle-arrow { color: #64738b; font-size: 0.7rem; }
  nav { display: flex; align-items: center; gap: 0.18rem; min-width: 0; }
  nav button {
    display: inline-flex;
    align-items: center;
    gap: 0.34rem;
    height: 27px;
    padding: 0 0.55rem;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: #65748c;
    cursor: pointer;
    font-size: 0.57rem;
    font-weight: 700;
    letter-spacing: 0.08em;
  }
  nav button:hover { color: #dce9f8; background: rgba(105, 217, 255, 0.045); }
  nav button.active { color: #f3f8ff; border-color: rgba(255, 59, 167, 0.22); background: rgba(255, 59, 167, 0.08); }
  nav button span { min-width: 16px; padding: 0.05rem 0.25rem; border-radius: 99px; background: rgba(255, 255, 255, 0.055); color: #8d9bb1; text-align: center; font-size: 0.51rem; }
  .dock-health { display: flex; align-items: center; gap: 0.55rem; }
  .stream-state { display: inline-flex; align-items: center; gap: 0.35rem; color: #6d7c93; font-size: 0.53rem; letter-spacing: 0.09em; }
  .stream-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--success); box-shadow: 0 0 10px rgba(67, 217, 163, 0.42); }
  .error-count { color: var(--danger); font-size: 0.53rem; font-weight: 750; letter-spacing: 0.06em; }
  .terminal-body { height: calc(100% - 36px); display: grid; min-height: 0; background: rgba(4, 7, 12, 0.96); }
  .terminal-output {
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 0.72rem 0.85rem;
    scrollbar-width: none;
    overscroll-behavior: contain;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    font-size: 0.66rem;
    line-height: 1.55;
  }
  .terminal-output::-webkit-scrollbar { width: 0; height: 0; display: none; }
  pre { margin: 0 0 0.22rem; white-space: pre-wrap; overflow-wrap: anywhere; color: #aebbd0; font: inherit; }
  pre.command { color: var(--accent-secondary); }
  pre.error { color: #ff8497; }
  pre.system { color: var(--accent-warm); }
  .command-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.55rem;
    min-height: 36px;
    padding: 0 0.85rem;
    border-top: 1px solid rgba(145, 174, 214, 0.1);
    background: rgba(8, 13, 22, 0.96);
    font-family: "SFMono-Regular", Consolas, monospace;
    font-size: 0.64rem;
  }
  .command-line span { color: var(--accent); }
  .command-line input { min-width: 0; height: 34px; padding: 0; border: 0; outline: 0; background: transparent; color: #ecf6ff; font: inherit; caret-color: var(--accent-secondary); }
  .terminal-body:has(.command-line) { grid-template-rows: minmax(0, 1fr) auto; }
  .log-line {
    display: grid;
    grid-template-columns: 68px 48px 92px minmax(180px, 1fr);
    gap: 0.55rem;
    align-items: baseline;
    min-width: 0;
    padding: 0.15rem 0;
    color: #9eabc0;
  }
  .log-line time { color: #526177; font-variant-numeric: tabular-nums; }
  .log-line .level { color: #77dffc; font-weight: 750; }
  .log-line.warn .level { color: var(--accent-warm); }
  .log-line.error .level, .log-line.fatal .level { color: var(--danger); }
  .log-line .source { overflow: hidden; color: #7d8ca4; text-overflow: ellipsis; white-space: nowrap; }
  .log-line .message { min-width: 0; overflow-wrap: anywhere; color: #cbd6e5; }
  .log-line code { grid-column: 4; overflow: hidden; color: #62718a; text-overflow: ellipsis; white-space: nowrap; }
  .job-header, .job-line { display: grid; grid-template-columns: minmax(110px, 0.8fr) 130px minmax(120px, 0.8fr) minmax(220px, 2fr); gap: 0.7rem; min-width: 660px; padding: 0.35rem 0.45rem; border-bottom: 1px solid rgba(145, 174, 214, 0.08); }
  .job-header { position: sticky; top: -0.72rem; z-index: 2; background: #080d16; color: #607089; font-size: 0.53rem; font-weight: 750; letter-spacing: 0.09em; }
  .job-line { color: #9eabc0; }
  .job-line strong { color: #dce6f4; }
  .job-line > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .job-status { color: var(--accent-secondary); }
  .job-status.failed { color: var(--danger); }
  .job-status.succeeded { color: var(--success); }
  .empty { margin: 0; color: #5c6a80; }

  @media (max-width: 700px) {
    .terminal-dock.open { height: min(var(--dock-height), 52dvh); }
    .dock-health { display: none; }
    .dock-bar { grid-template-columns: auto minmax(0, 1fr); padding-inline: 0.45rem; }
    .dock-toggle strong { display: none; }
    nav { justify-content: end; }
    nav button { padding-inline: 0.4rem; }
    .log-line { grid-template-columns: 58px 42px minmax(0, 1fr); }
    .log-line .source { display: none; }
    .log-line code { grid-column: 3; }
  }
</style>
