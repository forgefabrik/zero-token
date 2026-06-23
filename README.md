# Nova

> **Hinweis:** Nova ist ein inoffizielles, experimentelles lokales Werkzeug. Es ist kein Produkt von OpenAI, Anthropic, Google oder einem anderen unterstützten Anbieter.

Nova verbindet lokal angemeldete Web-Modelle und API-Provider mit einem OpenAI-kompatiblen Gateway, einer Web-Konsole, einem Playground und einem optionalen Coding-Agent.

## Funktionen

- **Multi-Provider-Gateway** für ChatGPT Web, Claude Web, Gemini Web, DeepSeek, Qwen, GLM und weitere Provider
- **OpenAI-kompatible Endpunkte** für `/v1/models`, `/v1/responses` und `/v1/chat/completions`
- **Web-Konsole** für Provider, Accounts, Modelle, Einstellungen und Playground
- **Nova Agent** als Integration des eigenständigen MIT-lizenzierten Projekts `yoyo-evolve`
- **Lokale Speicherung** mit restriktiven Dateiberechtigungen und redigierter Admin-API
- **Kompatibilitätsalias**: Der bisherige Befehl `zt` bleibt gültig

## Voraussetzungen

- Node.js `>= 22.15.0`
- pnpm
- Chrome oder Chromium für Web-Logins
- optional Rust/Cargo für den Coding-Agent

## Installation

```bash
pnpm install
pnpm build
```

Nach dem Build stehen beide CLI-Namen zur Verfügung:

```bash
nova --help
zt --help
```

## Schnellstart

```bash
# Provider anzeigen und anmelden
nova providers list
nova login --provider=chatgpt-web

# Modelle aktualisieren
nova models refresh
nova models list

# Gateway starten
nova start
```

Das Gateway bindet standardmäßig an `127.0.0.1:3000`.

## Nova Agent

Nova integriert `yoyo-evolve` als separates Agent-Backend. Der Rust-Quellbaum wird nicht dupliziert. Stattdessen startet Nova das installierte `yoyo`-Binary mit dessen `custom`-Provider gegen das lokale OpenAI-kompatible Gateway.

```bash
# yoyo-agent über Cargo installieren
nova agent install

# Projektkonfiguration erzeugen
nova agent init

# Binary und Gateway prüfen
nova agent doctor

# Agent starten
nova agent --model gpt-4o
```

Zusätzliche Argumente werden nur nach `--` an das Agent-Backend weitergegeben:

```bash
nova agent --model gpt-4o -- --quiet
```

`nova agent init` erzeugt, sofern noch nicht vorhanden:

- `.yoyo.toml` mit `provider = "custom"` und der lokalen Nova-Gateway-URL
- `.yoyo/instructions.md` mit Sicherheits- und Projektregeln

## Web-Konsole

```bash
pnpm ui:build
nova start
```

Die Web-Konsole enthält:

- Playground für Streaming-Chat
- Provider-Onboarding mit kopierbaren Nova-Befehlen
- Account- und Session-Verwaltung
- Modellfilter und Cache-Aktualisierung
- Nova-Agent-Anleitung
- sichere, redigierte Konfigurationsansicht

## Konfiguration und Migration

Neue Installationen verwenden:

```text
~/.config/nova/
```

Existiert bereits ein alter Datenordner unter `~/.config/zero-token/`, verwendet Nova ihn automatisch weiter. Ein expliziter Pfad kann mit `NOVA_HOME` gesetzt werden.

## Sicherheit

- Passwörter werden nicht gespeichert
- Cookies, Tokens und API-Schlüssel werden nicht im Frontend angezeigt
- sensible Werte müssen aus Logs redigiert werden
- Account-Dateien verwenden restriktive Berechtigungen (`0600`)
- das Gateway ist standardmäßig nur lokal erreichbar
- der Agent erhält keine Browser-Cookies oder Account-Dateien, sondern nur Zugriff auf das lokale `/v1`-Gateway

## Drittanbieter

Nova integriert das eigenständige Projekt `yoyo-evolve` von yologdev als optionales ausführbares Backend. Das Projekt steht unter der MIT-Lizenz. Details stehen in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Lizenz

Nova steht unter der MIT-Lizenz.

## Implementierungsplan

Der bestehende Architektur- und Implementierungsplan befindet sich unter [`docs/zero-token/impl-plan.md`](docs/zero-token/impl-plan.md). Historische Pfade bleiben während der Migration bestehen.
