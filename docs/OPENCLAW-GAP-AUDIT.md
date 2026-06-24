# Nova ↔ OpenClaw Zero Token: vollständiger Gap-Audit

Stand: 24.06.2026

## Referenzpfad in OpenClaw

1. `onboard.sh` prüft Node, Build und startet `node openclaw.mjs onboard webauth`.
2. `openclaw.mjs` lädt `dist/entry.js`.
3. `entry.ts` delegiert an `runCli()`.
4. Commander registriert `onboard webauth`.
5. `onboard-web-auth.ts` führt je Provider aus:
   - Browser-Login
   - Credentials in `auth-profiles.json`
   - Modell-Whitelist in `openclaw.json`
   - Synchronisierung der Providerkonfiguration
6. Die Bridge verbindet Modell-ID, Provider-Client und Stream-Adapter.

Wichtig: OpenClaw speichert Web-Credentials als `${providerId}:default`. Ein erneutes Onboarding überschreibt dieses Profil. Das ist kein echtes Multi-Account-System.

## In Nova vollständig abgeschlossen

- Öffentliche Domain-Endpunkte unter `https://bkg.eysho.info/v1`.
- Bearer-API-Key für alle öffentlichen `/v1`-Routen.
- Persistenter Remote-Chromium-Browser über feste interne CDP-Adresse.
- CDP-Host-/WebSocket-Auflösung.
- Provider-Loginjobs mit sichtbarem Remote-Browser.
- Account-Speicherung mit Provider, Plan, Sessionstatus und restriktiven Dateien.
- Modellcache veröffentlicht nur Provider mit registriertem Runtime-Adapter.
- ChatGPT, Qwen und GLM sind in der Runtime-Registry registriert.
- ChatGPT nutzt OpenClaw-kompatiblen Request-Body und DOM-Fallback bei 403/422.
- Qwen und GLM besitzen Browser-Inference-Adapter.
- Nach erfolgreichem Login wird der Modellcache automatisch aktualisiert.
- Zentrales Gateway-Logging für API-Aufrufe mit Request-ID, Route, Modell, Account, Status und Dauer.
- Playground speichert Modellname und Provider pro Antwort als Snapshot.
- Buildskripte erkennen Imageänderungen über Inhalts-Hashes.
- Startskript initialisiert API-Key-Rechte und erstellt Nova neu.

## Eingebaut, aber noch nicht vollständig produktionsbewiesen

### Qwen

- Runtime-Adapter und Modellkatalog vorhanden.
- Noch offen: reale Tests gegen mehrere Qwen-Accounts und alle SSE-Eventvarianten.
- Modellkatalog ist derzeit referenzbasiert, nicht dynamisch aus dem Account gelesen.

### GLM

- Signierter Browser-Request und Modellkatalog vorhanden.
- Noch offen: reproduzierbare Tests für alle vier Modell-zu-Assistant-Zuordnungen.
- Modellkatalog ist derzeit referenzbasiert, nicht dynamisch aus dem Account gelesen.

### Provider-Runtime-Status

- Backend-Route `/api/provider-runtime` vorhanden und aktiv.
- Noch offen: vollständige Integration in die bestehende Providerkarten-Oberfläche.

## Angefangen, aber nicht fertig

### Claude

- Login, Planerkennung und Sessionprüfung vorhanden.
- Es fehlt ein registrierter Claude-Modellkatalog.
- Es fehlt der Claude-Inference-/Stream-Adapter.
- Deshalb darf Claude noch keine Modelle veröffentlichen.

### Weitere Webprovider

Für Gemini, DeepSeek, Grok, Perplexity, Kimi, Doubao, GLM International, Qwen China und XiaoMiMo existieren teilweise Loginmodule. Es fehlen je nach Provider:

- Modellkatalog
- Runtime-Registry-Eintrag
- Inference-Adapter
- Streamparser
- Sessionvalidierung
- End-to-End-Test

Ein erfolgreicher Login allein bedeutet daher noch nicht, dass der Provider ausführbar ist.

### Google-Identität

- Persistentes Browserprofil kann eine manuelle Google-Anmeldung behalten.
- Nicht aktiv: Google-Account-Tabelle im Dashboard.
- Nicht aktiv: Zuordnung Google-Identität → Provideraccount.
- Nicht aktiv: isolierte Google-Profile für mehrere Identitäten.
- Nova speichert bewusst keine Google-Passwörter.

### Accounts-Oberfläche

- Vorhandene Accountliste funktioniert.
- Noch offen: Excel-artige gemeinsame Ansicht für Browseridentitäten und Provideraccounts.
- Noch offen: explizite Zuordnung Account → Browserprofil.
- Noch offen: Account-Import und Account-Export; CLI meldet diese Funktionen weiterhin als nicht implementiert.

### Mehrfachaccounts

Aktuell teilen sich alle Provider einen persistenten Chromium-Kontext. Dadurch können verschiedene Provider parallel angemeldet bleiben, aber mehrere Konten desselben Providers sind browserseitig nicht sauber isoliert.

Produktionslösung:

- eigener Chromium-Kontext oder eigenes User-Data-Verzeichnis je Browserprofil
- Account speichert `browserProfileId`
- Login, Discovery, Validierung und Inference lösen immer dasselbe Profil auf
- neuer Account verwendet neues Profil oder führt expliziten Provider-Logout durch
- Google-SSO kann als separates Identitätsprofil referenziert werden

### Discovery-Agent

- Providerkatalog und Discovery-Scan existieren.
- Noch offen: gefundene Webstreams automatisch in einen geprüften Runtime-Adapter überführen.
- Ein Fund darf nicht automatisch als produktionsfähiger Provider gelten.

### Usage und Quota

- Drei aufeinanderfolgende Authfehler vor Deaktivierung sind implementiert.
- Noch offen: providerindividuelle Quota-Auswertung und Reset-Zeitpunkte für alle Adapter.
- Noch offen: persistente Fehlerzähler über Neustarts.

### Tests und Release-Gates

Noch erforderlich:

- Contracttests für jeden Runtime-Adapter
- aufgezeichnete, redigierte SSE-Fixtures
- Playground-Test mit Modellwechsel
- API-Key- und Caddy-End-to-End-Test
- Login→Account→Modelle→Completion-Test je Provider
- Test für drei gleichzeitig gültige Provider
- Test für mehrere Accounts desselben Providers mit isolierten Profilen

## Bewusst nicht übernommen

Nova automatisiert keine CAPTCHA-, Turnstile-, Arkose- oder sonstigen Schutzmechanismen. Wenn eine legitime Browseranfrage zusätzliche Interaktion verlangt, bleibt diese sichtbar und manuell oder verwendet einen normalen DOM-Flow im bereits angemeldeten Browser.

## Definition of Done pro Provider

Ein Provider ist erst `healthy`, wenn alle Punkte erfüllt sind:

- Login erfolgreich
- Sessionvalidierung erfolgreich
- Modellkatalog vorhanden
- Runtime-Registry-Eintrag vorhanden
- Inference-Adapter vorhanden
- Streaming erfolgreich
- öffentliche API erfolgreich
- Playground erfolgreich
- Fehler-/Quota-Logging erfolgreich
- automatischer Test vorhanden

Bis dahin zeigt die Registry `not-implemented`, `login-required` oder `degraded`, niemals fälschlich `healthy`.
