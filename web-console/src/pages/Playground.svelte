<script lang="ts">
  import { getModels } from "../lib/api";
  import { chatCompletionStream } from "../lib/api";
  import type { Model, ChatMessage } from "../lib/api";

  let models = $state<Model[]>([]);
  let modelsLoading = $state(true);
  let selectedModel = $state("");
  let messages = $state<ChatMessage[]>([]);
  let input = $state("");
  let streaming = $state(false);
  let streamContent = $state("");
  let sending = $state(false);
  let error = $state<string | null>(null);

  let messagesEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  let abortRef = $state<AbortController | null>(null);

  $effect(() => {
    loadModels();
  });

  // Auto-scroll when new content arrives
  $effect(() => {
    // read reactive deps so this re-runs
    const _ = messages.length;
    const _s = streamContent;
    if (messagesEl) {
      requestAnimationFrame(() => {
        messagesEl!.scrollTop = messagesEl!.scrollHeight;
      });
    }
  });

  async function loadModels() {
    modelsLoading = true;
    try {
      models = await getModels();
      if (models.length > 0 && !selectedModel) {
        // Pick first GPT-4o model or first available
        const preferred = models.find((m) => m.id.includes("gpt-4o")) ?? models[0];
        selectedModel = preferred.id;
      }
    } catch (err) {
      console.error("Failed to load models", err);
    } finally {
      modelsLoading = false;
    }
  }

  function startNewChat() {
    messages = [];
    streamContent = "";
    error = null;
    streaming = false;
    sending = false;
    abortRef?.abort();
    abortRef = null;
    input = "";
    if (inputEl) inputEl.focus();
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !selectedModel || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    messages = [...messages, userMsg];
    input = "";
    error = null;
    streaming = true;
    streamContent = "";
    sending = true;

    abortRef = chatCompletionStream(
      selectedModel,
      messages,
      (chunk) => {
        streamContent += chunk;
      },
      (finishReason) => {
        if (streamContent) {
          messages = [...messages, { role: "assistant", content: streamContent }];
        }
        streamContent = "";
        streaming = false;
        sending = false;
        abortRef = null;
      },
      (err) => {
        error = err.message;
        streaming = false;
        sending = false;
        abortRef = null;
      },
    );
  }

  function cancelStream() {
    abortRef?.abort();
    abortRef = null;
    streaming = false;
    sending = false;
    if (streamContent) {
      messages = [...messages, { role: "assistant", content: streamContent }];
    }
    streamContent = "";
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function modelName(id: string): string {
    const m = models.find((x) => x.id === id);
    return m?.name ?? id;
  }

  function modelProvider(id: string): string {
    const m = models.find((x) => x.id === id);
    return m?.provider ?? "";
  }

  let enabledModels = $derived(models.filter((m) => m.enabled));
</script>

<div class="playground">
  <!-- Toolbar -->
  <div class="toolbar">
    <div class="toolbar-left">
      {#if modelsLoading}
        <span class="muted">Lade Modelle …</span>
      {:else}
        <select
          class="model-select"
          bind:value={selectedModel}
          disabled={streaming}
        >
          {#each enabledModels as m}
            <option value={m.id}>
              {m.name} ({m.provider})
            </option>
          {/each}
        </select>
        <span class="muted model-count">{enabledModels.length} Modelle</span>
      {/if}
    </div>
    <div class="toolbar-right">
      <button class="btn btn-ghost" onclick={startNewChat} disabled={messages.length === 0 && !streamContent}>
        ✦ Neu
      </button>
    </div>
  </div>

  <!-- Messages -->
  <div class="messages" bind:this={messagesEl}>
    {#if messages.length === 0 && !streamContent && !error}
      <div class="empty-state">
        <div class="empty-icon">✦</div>
        <p class="empty-title">Modell testen</p>
        <p class="empty-desc">
          Wähle ein Modell und sende eine Nachricht.
          {#if selectedModel}
            Aktiv: <span class="badge">{modelName(selectedModel)}</span>
          ​{/if}
        </p>
        {#if modelsLoading}
          <p class="muted">Lade Modelle …</p>
        {/if}
      </div>
    {/if}

    {#each messages as msg, i (i)}
      <div class="msg-row {msg.role}">
        <div class="msg-label">
          {#if msg.role === "assistant"}
            <span class="badge">{modelName(selectedModel) || "Modell"}</span>
          {:else}
            <span class="label-user">Du</span>
          {/if}
        </div>
        <div class="msg-content">{msg.content}</div>
      </div>
    {/each}

    {#if streamContent}
      <div class="msg-row assistant streaming">
        <div class="msg-label">
          <span class="badge">{modelName(selectedModel) || "Modell"}</span>
        </div>
        <div class="msg-content">
          {streamContent}<span class="stream-cursor">▊</span>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="msg-row error">
        <div class="msg-label"><span class="badge error-badge">Fehler</span></div>
        <div class="msg-content error-content">{error}</div>
      </div>
    {/if}
  </div>

  <!-- Input -->
  <div class="input-area">
    <textarea
      bind:this={inputEl}
      bind:value={input}
      class="input-field"
      placeholder="Nachricht eingeben … (Enter senden, Shift+Enter für Zeilenumbruch)"
      rows="1"
      disabled={sending}
      onkeydown={handleKeydown}
    ></textarea>
    {#if streaming}
      <button class="btn btn-stop" onclick={cancelStream} title="Antwort abbrechen">
        ■
      </button>
    {:else}
      <button
        class="btn btn-send"
        onclick={sendMessage}
        disabled={!input.trim() || !selectedModel || sending}
        title="Senden"
      >
        →
      </button>
    {/if}
  </div>
</div>

<style>
  .playground {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 7rem);
    max-height: calc(100vh - 7rem);
  }

  /* ── Toolbar ── */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-radius: 10px 10px 0 0;
    background: var(--card-bg);
    flex-shrink: 0;
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
  }

  .model-select {
    font-family: "Inter", system-ui, sans-serif;
    background: rgba(43, 30, 62, 0.8);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.4rem 0.7rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    min-width: 200px;
  }

  .model-select:focus {
    outline: none;
    border-color: var(--accent-secondary);
  }

  .model-select:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .model-count {
    font-size: 0.75rem;
  }

  .btn-ghost {
    background: transparent;
    border: 1px solid transparent;
    color: var(--muted);
    padding: 0.35rem 0.7rem;
    font-size: 0.8rem;
    border-radius: 6px;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;
  }

  .btn-ghost:hover {
    color: var(--text);
    border-color: var(--border);
  }

  .btn-ghost:disabled {
    opacity: 0.3;
    cursor: default;
  }

  /* ── Messages ── */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    border-left: 1px solid var(--border);
    border-right: 1px solid var(--border);
    background: rgba(26, 20, 35, 0.5);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    scroll-behavior: smooth;
  }

  .messages::-webkit-scrollbar {
    width: 6px;
  }

  .messages::-webkit-scrollbar-track {
    background: transparent;
  }

  .messages::-webkit-scrollbar-thumb {
    background: rgba(74, 78, 143, 0.3);
    border-radius: 3px;
  }

  /* ── Empty State ── */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    text-align: center;
    gap: 0.4rem;
  }

  .empty-icon {
    font-size: 2.5rem;
    color: rgba(164, 144, 194, 0.25);
    margin-bottom: 0.5rem;
  }

  .empty-title {
    font-family: "Outfit", system-ui, sans-serif;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text);
    margin: 0;
  }

  .empty-desc {
    font-size: 0.85rem;
    color: var(--muted);
    margin: 0;
  }

  .badge {
    display: inline-block;
    background: var(--accent);
    color: #fff;
    padding: 0.1rem 0.45rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: "SF Mono", "Fira Code", monospace;
    white-space: nowrap;
  }

  /* ── Message Row ── */
  .msg-row {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    max-width: 85%;
    transition: background 0.1s;
  }

  .msg-row.user {
    align-self: flex-end;
    background: rgba(74, 78, 143, 0.15);
    border: 1px solid rgba(74, 78, 143, 0.2);
  }

  .msg-row.assistant {
    align-self: flex-start;
    background: rgba(43, 30, 62, 0.5);
    border: 1px solid rgba(74, 78, 143, 0.15);
  }

  .msg-row.error {
    align-self: center;
    background: rgba(255, 107, 107, 0.08);
    border: 1px solid rgba(255, 107, 107, 0.2);
  }

  .msg-label {
    font-size: 0.7rem;
  }

  .label-user {
    color: var(--accent-secondary);
    font-size: 0.7rem;
    font-family: "SF Mono", "Fira Code", monospace;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .msg-content {
    font-size: 0.9rem;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .error-content {
    color: #ff6b6b;
    font-size: 0.82rem;
  }

  .error-badge {
    background: rgba(255, 107, 107, 0.2);
    color: #ff6b6b;
  }

  .streaming {
    border-style: dashed;
    border-color: rgba(164, 144, 194, 0.25);
  }

  .stream-cursor {
    display: inline-block;
    color: var(--accent-secondary);
    animation: blink 0.8s step-end infinite;
    font-size: 0.95rem;
    line-height: 1;
    margin-left: 0.05rem;
  }

  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0; }
  }

  /* ── Input Area ── */
  .input-area {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 10px 10px;
    background: var(--card-bg);
    flex-shrink: 0;
  }

  .input-field {
    flex: 1;
    font-family: "Inter", system-ui, sans-serif;
    background: rgba(26, 20, 35, 0.6);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.6rem 0.8rem;
    border-radius: 8px;
    font-size: 0.875rem;
    resize: none;
    outline: none;
    min-height: 42px;
    line-height: 1.4;
    transition: border-color 0.15s;
  }

  .input-field:focus {
    border-color: var(--accent-secondary);
  }

  .input-field::placeholder {
    color: var(--muted);
    opacity: 0.6;
  }

  .input-field:disabled {
    opacity: 0.4;
  }

  .btn-send,
  .btn-stop {
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .btn-send {
    background: var(--accent);
    border: 1px solid var(--accent);
    color: #fff;
  }

  .btn-send:hover:not(:disabled) {
    background: var(--accent-secondary);
    border-color: var(--accent-secondary);
  }

  .btn-send:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .btn-stop {
    background: rgba(255, 107, 107, 0.15);
    border: 1px solid rgba(255, 107, 107, 0.3);
    color: #ff6b6b;
    font-size: 1rem;
  }

  .btn-stop:hover {
    background: rgba(255, 107, 107, 0.25);
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .msg-row {
      max-width: 95%;
    }
    .model-select {
      min-width: 140px;
      font-size: 0.78rem;
    }
    .playground {
      height: calc(100vh - 8rem);
    }
  }
</style>
