# Zero Token

> **HINWEIS:** Dies ist ein **inoffizielles, experimentelles lokales Werkzeug**. Es ist kein OpenAI-Produkt und steht in keinem Zusammenhang mit OpenAI. Es verwendet ausschließlich die bestehende ChatGPT-Websession des Nutzers und kommuniziert direkt mit `chatgpt.com`.

Zero Token stellt die Chatmodelle eines lokal angemeldeten ChatGPT-Plus-Kontos über folgende lokale Oberflächen bereit:

- **CLI** – `zt`-Befehl für Login, Account-Verwaltung, Modellabfragen und Systemdiagnose
- **Web-Konsole** – Browser-UI zur Account-, Modell- und Gateway-Verwaltung
- **OpenAI-kompatibles HTTP-Gateway** – `GET /v1/models`, `POST /v1/responses`, `POST /v1/chat/completions`
- **Mehrere ChatGPT-Plus-Konten** – optionale Umschaltung bei Nutzungslimits
- **Proxy-Konfiguration** – optional, global oder pro Bereich

## Schnellstart

```bash
# Installation
pnpm install

# Build
pnpm build

# Hilfe anzeigen
pnpm dev --help
```

## Voraussetzungen

- **Node.js >= 22.15.0**
- **pnpm** (verfügbar via `corepack enable && corepack prepare pnpm@latest --activate`)
- **Chrome/Chromium** (für den Login über `chatgpt.com`)
- **ChatGPT Plus Account**

## CLI

```bash
zt login                   # Bei chatgpt.com anmelden
zt start                   # Gateway starten
zt status                  # Systemstatus
zt doctor                  # Systemdiagnose
zt accounts list           # Gespeicherte Konten
zt accounts validate <id>  # Sitzung validieren
zt accounts remove <id>    # Konto entfernen
zt models list             # Verfügbare Modelle
zt models refresh          # Modellcache aktualisieren
zt usage refresh           # Nutzungslimits aktualisieren
zt config show             # Konfiguration anzeigen
```

## Gateway

```text
GET  /v1/models
POST /v1/responses
POST /v1/chat/completions
GET  /health
GET  /ready
```

Das Gateway bindet standardmäßig an `127.0.0.1`.

## Sicherheit

- ChatGPT-Passwörter werden niemals erfasst oder gespeichert
- Cookies und Sessiondaten werden niemals im Frontend angezeigt
- Cookies und Tokens dürfen nicht in Logs erscheinen (Pino-Redaction)
- Account-Dateien werden mit restriktiven Berechtigungen (`0600`) gespeichert
- Das Gateway ist standardmäßig nur lokal erreichbar
- Keine garantierte automatische Sessionerneuerung – abgelaufene Sessions erfordern erneuten Browser-Login

## Lizenz

MIT

## Implementierungsplan

Der vollständige Architektur- und Implementierungsplan befindet sich in [docs/zero-token/impl-plan.md](docs/zero-token/impl-plan.md).
