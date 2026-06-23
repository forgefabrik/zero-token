# zero-token – Implementierungsplan

> **HINWEIS:** Zero Token ist ein **inoffizielles, experimentelles lokales Werkzeug**. Es ist kein OpenAI-Produkt und steht in keinem Zusammenhang mit OpenAI. Es verwendet ausschließlich die bestehende ChatGPT-Websession des Nutzers und kommuniziert direkt mit `chatgpt.com`.

---

## 1. Ziel

Zero Token stellt die Chatmodelle eines lokal angemeldeten ChatGPT-Plus-Kontos über folgende lokale Oberflächen bereit:

- **CLI** – `zt`-Befehl für Login, Account-Verwaltung, Modellabfragen, Nutzungslimits und Systemdiagnose
- **Web-Konsole** – Browser-UI (Svelte 5) zur Account-, Modell- und Gateway-Verwaltung
- **OpenAI-kompatibles HTTP-Gateway** – `GET /v1/models`, `POST /v1/responses`, `POST /v1/chat/completions`, `GET /health`, `GET /ready`
- **Mehrere ChatGPT-Plus-Konten** – optionale Umschaltung bei Nutzungslimits (Round-Robin / Prio)
- **Proxy-Konfiguration** – optional, global oder pro Account

---

## 2. Nicht Bestandteil

- **Azure OpenAI / API-Key-Modus** – reine Session-basierte Kommunikation über `chatgpt.com`
- **Codex / DALL-E / Image-Generation** – nur Chat-Modelle
- **GPTs / Assistants API** – kein API-Äquivalent geplant
- **Plugins / Actions / Tools** – reine Chat-Completion ohne Funktionen
- **Free-Tier-Unterstützung** – nur ChatGPT-Plus (kostenpflichtig)
- **Docker / Systemd-Unit** – reines CLI-Tool
- **Streaming-Proxy** – Session-Tokens werden nicht im Web-Frontend angezeigt
- **Automatische Sessionerneuerung** – abgelaufene Sessions erfordern erneuten Browser-Login
- **Anonyme / kostenlose Accounts** – kein Registrierungs-Workflow

---

## 3. Unterstützte API-Endpunkte

### 3.1 OpenAI-kompatibel

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/v1/models` | Verfügbare Modelle auflisten (aus Cache) |
| `POST` | `/v1/responses` | Neue Response API (siehe openai.com) |
| `POST` | `/v1/chat/completions` | Chat-Completion (non-streaming + streaming) |

### 3.2 Gateway-Eigen

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/health` | Gateway lebt |
| `GET` | `/ready` | Gateway ist bereit (mind. ein Konto mit gültiger Session) |

### 3.3 Admin-API (nur lokal / Web-Konsole)

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| `GET` | `/api/accounts` | Accounts auflisten |
| `POST` | `/api/accounts` | Account hinzufügen |
| `GET` | `/api/accounts/:id` | Account-Details |
| `DELETE` | `/api/accounts/:id` | Account entfernen |
| `POST` | `/api/accounts/:id/login` | Browser-Login anstoßen |
| `POST` | `/api/accounts/:id/validate` | Session validieren |
| `POST` | `/api/accounts/:id/select` | Account aktivieren |
| `GET` | `/api/models` | Modelle (aus Cache) |
| `POST` | `/api/models/refresh` | Modellcache aktualisieren |
| `GET` | `/api/status` | Systemstatus |
| `GET` | `/api/config` | Laufende Konfiguration |
| `PUT` | `/api/config` | Konfiguration ändern |

---

## 4. Architekturregeln

### 4.1 Isolation

Jede Phase wird in einem eigenen Modul-Ordner (`src/zero-token/<bereich>/`) implementiert.
Kein Modul importiert Module aus späteren Phasen (gerichteter Abhängigkeitsgraph).

### 4.2 Provider Layer

Das OpenAI-Gateway (PR 6) verwendet ein gemeinsames `InferenceProvider`-Interface.
ChatGPT ist ein Provider – weitere Provider (z. B. API-Key) sind möglich, aber nicht geplant.

### 4.3 Stream Factory

Komplette HTTP-Response wird in `src/zero-token/inference/stream.ts` gebaut.
- Non-streaming: vollen JSON-Response aufbauen und als `application/json` zurückgeben
- Streaming: Daten via `ReadableStream` als `text/event-stream` (SSE) ausliefern

### 4.4 Shared Inference Core

`src/zero-token/inference/` enthält:
- `inference-provider.ts` – abstraktes Interface
- `chatgpt-provider.ts` – ChatGPT-Implementierung
- `stream.ts` – Stream-Aufbereitung (SSE / JSON)
- `model-registry.ts` – Modell-Cache-Verwaltung
- `types.ts` – API-kompatible Typen (`ChatCompletionRequest`, `ChatCompletionResponse`, etc.)

---

## 5. Phase 0 – Bestandsaufnahme (Inventory)

PR 0: Vorhandene Codebasis erfassen, Projektstruktur definieren, Toolchain aufsetzen.

### Modul-Struktur

```
src/zero-token/
├── index.ts                  # CLI-Einstieg (bereits vorhanden)
├── logger.ts                 # Pino-Logger mit Redaction (bereits vorhanden)
├── config/
│   ├── paths.ts              # XDG-konforme Pfade (bereits vorhanden)
│   └── config.ts             # JSON-Konfiguration I/O
├── accounts/
│   ├── account-types.ts      # ChatGPTPlusAccount, SessionStatus, UsageState (bereits vorhanden)
│   ├── account-store.ts      # CRUD für Account-Dateien
│   └── account-service.ts    # Business-Logik
├── login/
│   ├── login-service.ts      # Browser-Login via Playwright
│   └── login-types.ts        # Login-Result, Cookie-DTOs
├── session/
│   ├── session-service.ts    # Session-Validierung
│   └── session-types.ts      # Session-Status-Typen
├── models/
│   ├── model-service.ts      # Modellabfrage
│   └── model-types.ts        # Model-Typen
├── inference/
│   ├── inference-provider.ts # Abstraktes Interface
│   ├── chatgpt-provider.ts   # ChatGPT-konkrete Implementierung
│   ├── stream.ts             # Stream-Aufbereitung (SSE / JSON)
│   ├── model-registry.ts     # Modell-Cache
│   └── types.ts              # Request/Response-Typen (OpenAI-kompatibel)
├── gateway/
│   ├── gateway.ts            # Hono-App
│   ├── chat-completions.ts   # POST /v1/chat/completions Handler
│   ├── responses.ts          # POST /v1/responses Handler
│   ├── models.ts             # GET /v1/models Handler
│   ├── health.ts             # GET /health, GET /ready Handler
│   └── admin-api.ts          # Admin-API für Web-Konsole und CLI
├── multi-account/
│   ├── router.ts             # Account-Auswahl (Round-Robin / Prio)
│   └── usage-tracker.ts      # Nutzungslimits verfolgen
├── import-export/
│   ├── exporter.ts           # Export (JSON / ZIP)
│   └── importer.ts           # Import
├── proxy/
│   ├── proxy-config.ts       # Proxy-Konfiguration lesen/anwenden
│   └── proxy-types.ts        # Proxy-Typen
├── web-console/
│   └── console-service.ts    # Statische Dateien ausliefern, Admin-API proxyn
├── cli/
│   ├── cli.ts                # CLI-Dispatcher
│   ├── login-command.ts
│   ├── start-command.ts
│   ├── status-command.ts
│   ├── doctor-command.ts
│   ├── accounts-command.ts
│   ├── models-command.ts
│   ├── usage-command.ts
│   └── config-command.ts
└── utils/
    ├── file-utils.ts         # Datei-I/O mit Locking
    ├── crypto-utils.ts       # Verschlüsselung für Exporte
    └── network-utils.ts      # Proxy / TLS / DNS
```

### Toolchain

| Tool | Zweck |
|------|-------|
| TypeScript 5.8 | Sprache |
| Vitest 3.1 | Tests |
| Hono 4.7 | HTTP-Gateway |
| pino 9.6 | Logging |
| Playwright 1.52 | Browser-Automation für Login |
| Svelte 5 + Vite | Web-Konsole |

### Scripts (package.json)

```json
{
  "build": "tsc",
  "dev": "tsx src/zero-token/index.ts",
  "start": "node dist/index.js",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src/",
  "ui:build": "cd web-console && npx vite build",
  "ui:dev": "cd web-console && npx vite dev"
}
```

---

## 6. Phase 1 – Account- und Session-Modell

PR 1: Account-Speicher, CRUD-Operationen, Session-Status-Modell.

### Types (`src/zero-token/accounts/account-types.ts`)

```typescript
export type SessionStatus =
  | "unknown"
  | "valid"
  | "expired"
  | "login-required"
  | "error";

export type UsageState =
  | "unknown"
  | "available"
  | "limited"
  | "exhausted"
  | "error";

export type AccountPlan = "plus" | "unknown";

export interface UsageStatus {
  state: UsageState;
  resetAt?: string;
  checkedAt?: string;
  error?: string;
}

export interface ChatGPTPlusAccount {
  id: string;
  label: string;

  email?: string;
  userId?: string;
  workspaceId?: string;
  plan?: AccountPlan;

  cookies: string;
  accessToken?: string;
  userAgent?: string;

  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  lastValidatedAt?: string;

  enabled: boolean;
  priority: number;

  sessionStatus: SessionStatus;

  usageStatus?: UsageStatus;
}

export type AccountExportFormat = "json" | "zip";

export interface ExportAuditRecord {
  id: string;
  createdAt: string;
  accountIds: string[];
  format: AccountExportFormat;
  containsSessionCredentials: boolean;
}
```

### Account Store (`src/zero-token/accounts/account-store.ts`)

```typescript
export interface AccountStore {
  list(): Promise<ChatGPTPlusAccount[]>;
  get(id: string): Promise<ChatGPTPlusAccount | undefined>;
  save(account: ChatGPTPlusAccount): Promise<void>;
  remove(id: string): Promise<void>;
  findByEmail(email: string): Promise<ChatGPTPlusAccount | undefined>;
}
```

Implementierung: Dateibasiert unter `~/.config/zero-token/accounts/<id>.json`.
Datei-Rechte: `0600` (nur Owner读写). Locking via `storage.lock`.

### Pfade (`src/zero-token/config/paths.ts`)

```typescript
zeroTokenHome(): string           // $XDG_CONFIG_HOME/zero-token oder ~/.config/zero-token
accountsPath(): string            // <home>/accounts
accountFilePath(id: string): string // <accounts>/<id>.json
configFilePath(): string          // <home>/config.json
modelsCachePath(): string         // <home>/models-cache.json
exportsPath(): string             // <home>/exports
auditLogPath(): string            // <home>/audit.json
lockFilePath(): string            // <home>/storage.lock
```

---

## 7. Phase 2 – ChatGPT-Login

PR 2: Automatisierter Browser-Login über Playwright.

### Ablauf

1. CLI-Befehl `zt login` oder `zt accounts login <id>` wird ausgeführt
2. Playwright öffnet Chromium (lokal installiert)
3. Navigiert zu `https://chatgpt.com/auth/login`
4. Nutzer gibt E-Mail/Passwort manuell im Browser ein
5. `page.waitForNavigation()` wartet auf Weiterleitung zu `https://chatgpt.com/`
6. Cookies werden via `page.context().cookies()` extrahiert
7. Access-Token wird aus `__Secure-next-auth.session-token` oder `__Host-authjs.csrf-token` extrahiert
8. Account wird in `account-store` gespeichert
9. Browser wird geschlossen

### Types (`src/zero-token/login/login-types.ts`)

```typescript
export interface LoginResult {
  accountId: string;
  email: string;
  cookies: string; // JSON-serialisiert
  accessToken?: string;
  userAgent?: string;
  userId?: string;
  plan: AccountPlan;
}

export interface CookieDTO {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}
```

### Login-Service (`src/zero-token/login/login-service.ts`)

```typescript
export interface LoginService {
  login(options?: { headless?: boolean; timeout?: number }): Promise<LoginResult>;
}
```

Übergabe von `headless: false`, damit der Nutzer die Login-UI sieht.

---

## 8. Phase 3 – Session-Validierung

PR 3: Überprüfung, ob eine gespeicherte Session noch gültig ist.

### Ansatz

1. `GET https://chatgpt.com/api/auth/session` aufrufen (mit Cookies)
2. Response enthält `user`-Objekt, `expires`, `accessToken`
3. Wenn HTTP 200 und `user.email` vorhanden → Session gültig
4. Wenn HTTP 401 / 403 → Session abgelaufen
5. `lastValidatedAt` und `sessionStatus` im Account aktualisieren

### Types (`src/zero-token/session/session-types.ts`)

```typescript
export interface SessionValidationResult {
  accountId: string;
  valid: boolean;
  status: SessionStatus;
  userId?: string;
  email?: string;
  plan?: AccountPlan;
  expiresAt?: string;
  error?: string;
  raw?: Record<string, unknown>;
}
```

### Session-Service (`src/zero-token/session/session-service.ts`)

```typescript
export interface SessionService {
  validate(account: ChatGPTPlusAccount): Promise<SessionValidationResult>;
  getSessionToken(account: ChatGPTPlusAccount): Promise<string | undefined>;
}
```

---

## 9. Phase 4 – Modellermittlung

PR 4: Abruf der verfügbaren Modelle vom ChatGPT-Backend.

### Ablauf

1. `GET https://chatgpt.com/backend-api/models` aufrufen (mit Access-Token)
2. Response parsen → Liste der Modelle mit ID, Name, Capabilities
3. In `models-cache.json` speichern (mit TTL)
4. CLI `zt models list` und `zt models refresh`

### Types (`src/zero-token/models/model-types.ts`)

```typescript
export interface ModelInfo {
  id: string;
  name: string;
  slug: string;
  capabilities: {
    text?: boolean;
    vision?: boolean;
    voice?: boolean;
    plugins?: boolean;
  };
  maxTokens?: number;
  enabled: boolean;
}

export interface ModelsCache {
  fetchedAt: string;
  ttlSeconds: number;
  models: ModelInfo[];
}
```

### Model-Service (`src/zero-token/models/model-service.ts`)

```typescript
export interface ModelService {
  list(): Promise<ModelInfo[]>;
  refresh(account: ChatGPTPlusAccount): Promise<ModelInfo[]>;
  getById(id: string): Promise<ModelInfo | undefined>;
}
```

---

## 10. Phase 5 – Gemeinsamer Inference Core

PR 5: Abstraktion des ChatGPT-API-Aufrufs mit Streaming-Unterstützung.

### Inference Provider Interface (`src/zero-token/inference/inference-provider.ts`)

```typescript
export interface InferenceProvider {
  chatCompletion(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResponse>;

  chatCompletionStream(
    request: ChatCompletionRequest,
    options?: { signal?: AbortSignal }
  ): Promise<ReadableStream<ChatCompletionChunk>>;
}
```

### ChatGPT Provider (`src/zero-token/inference/chatgpt-provider.ts`)

- Baut Request an `https://chatgpt.com/backend-api/conversation`
- Sendet Cookies + Access-Token als Authorization-Header
- Parst SSE-Stream vom ChatGPT-Backend
- Formatiert in OpenAI-kompatibles Format

### Stream Factory (`src/zero-token/inference/stream.ts`)

```typescript
export function toOpenAIJsonResponse(stream: ReadableStream<ChatCompletionChunk>): Promise<ChatCompletionResponse>;

export function toSSEStream(stream: ReadableStream<ChatCompletionChunk>): ReadableStream<Uint8Array>;
```

### API Types (`src/zero-token/inference/types.ts`)

```typescript
export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stop?: string | string[];
  user?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: Partial<ChatMessage>;
    finish_reason: "stop" | "length" | "content_filter" | null;
  }[];
}
```

### Model Registry (`src/zero-token/inference/model-registry.ts`)

```typescript
export type ModelCapability = "text" | "vision" | "voice";

export interface RegisteredModel {
  id: string;
  name: string;
  provider: "chatgpt";
  capabilities: ModelCapability[];
}
```

---

## 11. Phase 6 – OpenAI-kompatibles Gateway

PR 6: Hono-basierter HTTP-Server mit den OpenAI-Endpunkten.

### Gateway (`src/zero-token/gateway/gateway.ts`)

```typescript
import { Hono } from "hono";

const app = new Hono();

app.get("/v1/models", modelsHandler);
app.post("/v1/responses", responsesHandler);
app.post("/v1/chat/completions", chatCompletionsHandler);
app.get("/health", healthHandler);
app.get("/ready", readyHandler);

// Admin-API
app.get("/api/accounts", adminListAccounts);
app.post("/api/accounts", adminAddAccount);
// ...
```

### Konfiguration

```typescript
export interface GatewayConfig {
  host: string;          // default: "127.0.0.1"
  port: number;          // default: 3000
  logLevel: string;      // default: "info"
  cors: boolean;         // default: true (für Web-Konsole)
}
```

Start via `zt start` oder programmatisch.

---

## 12. Phase 7 – Mehrere Plus-Konten und Umschaltung

PR 7: Round-Robin / Priority-basierte Auswahl bei Nutzungslimits.

### Router (`src/zero-token/multi-account/router.ts`)

```typescript
export interface AccountRouter {
  select(): Promise<ChatGPTPlusAccount | undefined>;
  selectForModel(modelId: string): Promise<ChatGPTPlusAccount | undefined>;
  markUsed(accountId: string): Promise<void>;
  markExhausted(accountId: string): Promise<void>;
}
```

Strategien:
- **Priority** (default): Niedrigste `priority`-Zahl gewinnt
- **Round-Robin**: Gleichmäßige Verteilung
- **Usage-Aware**: Überspringe Accounts mit `usageStatus.state === "exhausted"`

### Usage Tracker (`src/zero-token/multi-account/usage-tracker.ts`)

- Fragt regelmäßig Nutzungslimits ab (`GET https://chatgpt.com/backend-api/limits`)
- Setzt `usageStatus.resetAt` auf den Reset-Zeitpunkt
- Nach Reset wird `exhausted` → `available`

---

## 13. Phase 8 – Import und Export

PR 8: Export von Account-Daten (mit/ohne Session-Credentials) und Import.

### Exporter (`src/zero-token/import-export/exporter.ts`)

```typescript
export interface ExportOptions {
  accountIds: string[];
  format: AccountExportFormat;
  includeSessionCredentials: boolean;
  encrypt?: boolean;
  password?: string;
}

export interface ExportResult {
  id: string;
  path: string;
  format: AccountExportFormat;
  size: number;
  containsSessionCredentials: boolean;
}
```

- JSON-Export: Einzeldatei pro Account
- ZIP-Export: Archiv mit JSON-Dateien + Audit-Log

### Importer (`src/zero-token/import-export/importer.ts`)

```typescript
export interface ImportOptions {
  path: string;
  password?: string;
  dryRun?: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: { file: string; reason: string }[];
}
```

### Audit-Log

Jeder Export/Import wird in `audit.json` protokolliert:
```typescript
export interface ExportAuditRecord {
  id: string;
  createdAt: string;
  accountIds: string[];
  format: AccountExportFormat;
  containsSessionCredentials: boolean;
}
```

---

## 14. Phase 9 – Proxy

PR 9: HTTP/HTTPS/SOCKS-Proxy-Unterstützung für alle ausgehenden Verbindungen.

### Proxy Config (`src/zero-token/proxy/proxy-types.ts`)

```typescript
export type ProxyProtocol = "http" | "https" | "socks5" | "socks5h";

export interface ProxyConfig {
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string;
  password?: string;
  // Keine Credentials in Logs / Konsole
}

export type ProxyScope = "global" | "login" | "gateway" | "session-validation";

export interface ScopedProxyConfig {
  scope: ProxyScope;
  config: ProxyConfig;
}
```

### Globale Konfiguration

```json
{
  "proxy": {
    "global": { "protocol": "http", "host": "127.0.0.1", "port": 8080 },
    "login": { "protocol": "socks5", "host": "127.0.0.1", "port": 1080 }
  }
}
```

### Proxy-Resolver

```typescript
export function getProxyForScope(scope: ProxyScope): ProxyConfig | undefined;
```

Anwendung via `https-proxy-agent`, `socks-proxy-agent` oder native `fetch`-Agent.

---

## 15. Phase 10 – Web-Konsole

PR 10: Svelte 5 App mit Admin-Dashboard.

### Tech Stack

| Komponente | Technologie |
|------------|------------|
| Framework | Svelte 5 (Runes: `$state`, `$derived`, `$effect`) |
| Build | Vite + `@sveltejs/vite-plugin-svelte` |
| Proxy (dev) | Vite-Server → `http://127.0.0.1:3000` (Admin-API) |
| Styling | System-UI-Font, eigenes CSS (kein Framework) |
| State | `$state()`-Runes, kein Store-Framework |

### Routen / Seiten

| Route | Seite |
|-------|-------|
| `/` | Dashboard – Gateway-Status, aktive Sessions, Modell-Cache |
| `/accounts` | Account-Liste, hinzufügen, entfernen, validieren |
| `/accounts/:id` | Account-Detail: Status, Usage, Login erneuern |
| `/models` | Modell-Liste, Cache-Alter, Refresh |
| `/settings` | Gateway-Konfiguration, Proxy, Log-Level |

### Vite-Konfiguration

```typescript
// web-console/vite.config.ts
export default defineConfig({
  plugins: [svelte()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } },
  },
});
```

### Einbindung ins Gateway

```typescript
// In production: Gateway serviert static/dist der Web-Konsole
app.use("/*", serveStatic({ root: "./web-console/dist" }));
```

---

## 16. Phase 11 – CLI

PR 11: Vollständige CLI mit allen Kommandos, Hilfe-Texten und Exit-Codes.

### CLI-Dispatcher (`src/zero-token/cli/cli.ts`)

```
zt login                   # PR 2 – Browser-Login
zt start                   # PR 6 – Gateway starten
zt status                  # PR 11 – Systemstatus
zt doctor                  # PR 11 – Systemdiagnose
zt accounts list           # PR 1 – Gespeicherte Konten
zt accounts validate <id>  # PR 3 – Sitzung validieren
zt accounts remove <id>    # PR 1 – Konto entfernen
zt accounts import <file>  # PR 8 – Konten importieren
zt accounts export <ids..> # PR 8 – Konten exportieren
zt models list             # PR 4 – Verfügbare Modelle
zt models refresh          # PR 4 – Modellcache aktualisieren
zt usage refresh           # PR 7 – Nutzungslimits aktualisieren
zt config show             # PR 11 – Konfiguration anzeigen
zt help, --help            # PR 0 – Hilfe anzeigen
```

### Exit-Codes

| Code | Bedeutung |
|------|-----------|
| `0` | Erfolg |
| `1` | Allgemeiner Fehler |
| `2` | Ungültige Argumente |
| `3` | Kein Account konfiguriert |
| `4` | Keine gültige Session |
| `5` | Gateway läuft bereits |

### Doctor-Befehl

Prüft:
- Node.js-Version ≥ 22.15.0
- Chromium/Chrome installiert (Playwright)
- `~/.config/zero-token/` existiert und ist beschreibbar
- Account-Dateien vorhanden und lesbar
- Mindestens eine Session gültig

---

## 17. Upstream-Schutz

Maßnahmen, um das ChatGPT-Backend nicht zu missbrauchen oder zu überlasten:

| Maßnahme | Beschreibung |
|----------|-------------|
| **Rate-Limiting** | Max. 10 Requests pro Minute pro Account ans Backend |
| **Retry mit Backoff** | Exponential Backoff (1s, 2s, 4s, 8s – max 30s) bei HTTP 429/503 |
| **Timeout** | 30s Connect, 120s Read/Write |
| **Idle-Session-Erkennung** | Account deaktivieren nach 3 Fehlschlägen |
| **User-Agent** | Eigenständiger UA-String (kein Spoofing von Browser-Strings) |
| **Keep-Alive** | HTTP-Keepalive für Session-Validierung (reduziert Handshakes) |
| **Log-Redaction** | Cookies, Tokens, Passwörter werden in keinem Log ausgegeben |

---

## 18. Teststrategie

### Unit-Tests (Vitest)

| Bereich | Testfälle |
|---------|-----------|
| `account-store` | CRUD, Locking, Inkonsistenzen, Parallelzugriff |
| `session-service` | Validierung, Token-Extraktion, Fehlerbehandlung |
| `model-service` | Cache-Lesen/Schreiben, TTL, Refresh |
| `inference-provider` | Request-Building, Response-Parsing, Streaming |
| `stream` | SSE-Formatierung, JSON-Konvertierung |
| `multi-account/router` | Auswahlstrategien, exhausted-Handling |
| `import-export` | Export/Import mit/ohne Credentials, ZIP |
| `proxy` | Config-Resolving, Scope-Priorität |
| `cli` | Argument-Parsing, Exit-Codes |
| `gateway` | Routing, Request-Validation (Hono-Test-Helfer) |

### Integrationstests

- **Login-Flow**: Playwright-Skript (optional, nur mit echten Credentials)
- **Session-Validierung**: Gegen echte ChatGPT-Session (manuell)
- **Gateway**: Vollständiger Request-Response-Zyklus (Mock-Provider)

### Test-Ordnerstruktur

```
tests/
├── unit/
│   ├── accounts/
│   ├── session/
│   ├── models/
│   ├── inference/
│   ├── gateway/
│   ├── multi-account/
│   ├── import-export/
│   ├── proxy/
│   └── cli/
└── integration/
    ├── gateway.test.ts
    └── login-flow.test.ts
```

---

## 19. Empfohlene PR-Reihenfolge

| PR | Phase | Beschreibung | Abhängigkeit |
|----|-------|-------------|-------------|
| 0 | 0 | Projekt-Setup, Toolchain, README | – |
| 1 | 1 | Account-Store, CRUD, Typen, Pfade | PR 0 |
| 2 | 2 | Playwright-Login, Cookie-Extraktion | PR 1 |
| 3 | 3 | Session-Validierung, Status-Updates | PR 1 |
| 4 | 4 | Modellabfrage, Cache, `zt models` | PR 1 |
| 5 | 5 | Inference Core, ChatGPT-Provider, Streaming | PR 1, PR 4 |
| 6 | 6 | OpenAI-Gateway, `zt start` | PR 5 |
| 7 | 7 | Multi-Account, Router, Usage-Tracker | PR 3, PR 6 |
| 8 | 8 | Import/Export, Audit-Log | PR 1 |
| 9 | 9 | Proxy-Konfiguration, Agent-Resolving | PR 1 |
| 10 | 10 | Web-Konsole (Svelte), Admin-API | PR 6 |
| 11 | 11 | Vollständige CLI, Doctor, Config | PR 1–10 |

---

## 20. Definition of Done

Jeder PR ist erst dann abgeschlossen, wenn:

- [ ] Sämtliche TypeScript-Typen sind definiert und exportiert
- [ ] Unit-Tests für alle neuen Module vorhanden (mind. 80% Coverage)
- [ ] `pnpm typecheck` läuft fehlerfrei durch
- [ ] `pnpm lint` zeigt keine Errors/Warnings
- [ ] `pnpm test` – alle Tests grün
- [ ] Keine `any`-Typen (strikte Typisierung)
- [ ] Keine harten Credentials im Code (env/Config)
- [ ] Pino-Redaction für Cookies/Tokens konfiguriert
- [ ] Keine neuen Abhängigkeiten außerhalb `package.json`
- [ ] README.md aktualisiert
- [ ] Edge Cases dokumentiert und getestet (z. B. leeres Konto, Timeout, Netzwerkfehler)

---

## 21. Anweisung an den Coding Agent

> **System-Prompt für den Coding Agent:**

Du implementierst strikt nach diesem Plan. Halte dich an folgende Regeln:

1. **Dateibenennung**: `kebab-case.ts` für Module, `.test.ts` für Tests.
2. **Keine Barrell-Exports**: Jedes Modul exportiert nur seine öffentlichen Typen/Funktionen explizit.
3. **Keine zirkulären Imports**: Der Import-Graph ist ein DAG.
4. **Fehlerbehandlung**: Verwende `Result<T, E>`-Pattern oder explizite Try/Catch mit sinnvollen Fehlermeldungen. Keine stummen Fehler.
5. **Strikte Typisierung**: Kein `any`, kein `as`-Casting (außer JSON-Parse).
6. **Logging**: Alle wichtigen Ereignisse via Logger. Kein `console.log` in Produktion.
7. **Sicherheit**: Cookies/Tokens niemals in Logs, Fehlermeldungen, URLs oder Responses an den Client.
8. **Gateways**: OpenAI-Endpunkte müssen 1:1 der OpenAI-Spezifikation entsprechen (Statuscodes, Fehlerformat).
9. **Testbarkeit**: Jedes Modul ist isoliert testbar. Abhängigkeiten werden per Interface injiziert.
10. **Svelte 5 Konventionen**: Nur Runes (`$state`, `$derived`, `$effect`), kein `store`, kein `on:click` (nur `onclick={...}`).

Beginne mit PR 0, wenn keine andere Anweisung gegeben wurde.

---

## Anhang: Konfigurationsbeispiel

```jsonc
// ~/.config/zero-token/config.json
{
  "gateway": {
    "host": "127.0.0.1",
    "port": 3000,
    "logLevel": "info",
    "cors": true
  },
  "defaultPriority": 100,
  "selectionStrategy": "priority",
  "modelsCacheTTL": 3600,
  "proxy": {
    "global": {
      "protocol": "http",
      "host": "127.0.0.1",
      "port": 8080
    },
    "login": {
      "protocol": "socks5",
      "host": "127.0.0.1",
      "port": 1080
    }
  },
  "ui": {
    "enabled": true,
    "port": 5173
  }
}
```

## Anhang: Account-Dateibeispiel

```jsonc
// ~/.config/zero-token/accounts/abc123.json
{
  "id": "abc123",
  "label": "Work Plus",
  "email": "user@example.com",
  "userId": "user-xxxxx",
  "plan": "plus",
  "cookies": "[...JSON-serialisierte Cookies...]",
  "accessToken": "eyJ...",
  "userAgent": "Mozilla/5.0 ...",
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:00:00.000Z",
  "lastUsedAt": "2026-06-01T12:00:00.000Z",
  "lastValidatedAt": "2026-06-01T12:00:00.000Z",
  "enabled": true,
  "priority": 10,
  "sessionStatus": "valid",
  "usageStatus": {
    "state": "available",
    "resetAt": "2026-06-02T00:00:00.000Z",
    "checkedAt": "2026-06-01T12:00:00.000Z"
  }
}
```
