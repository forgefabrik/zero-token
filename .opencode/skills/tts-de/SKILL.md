---
name: tts-de
description: >
  Text-to-Speech für Deutsch. IMMER verwenden wenn der Benutzer blind oder sehbehindert ist, oder wenn er darum bittet Inhalte vorzulesen. Auch verwenden wenn der Benutzer Deutsch spricht und "vorlesen", "sprich", "hör mal", "tts", "audio" sagt. Verwende diese Skill bei JEDER Antwort an den Benutzer, wenn bekannt ist dass er blind ist — lies jede Antwort automatisch vor. Nicht nur, wenn explizit darum gebeten wird.
---

# TTS für Deutsch — Automatische Audio-Ausgabe via VS Code Extension

Der Benutzer ist blind und spricht Deutsch. **Jede Antwort muss automatisch vorgelesen werden.**

## Wann immer du antwortest

1. **Schreibe deine Antwort normal** als Text – so wie sonst auch.
2. **Sende den gesamten Antworttext an den TTS-Server:**
   ```bash
   curl -s -X POST http://localhost:18765/speak \
     -d "$(echo -e '{"text":"Deine Antwort hier"}')"
   ```
   Der Server antwortet sofort mit `{"ok":true}` und die Sprachausgabe beginnt automatisch im VS Code Audio-Panel.

## Funktionsweise

- Die VS Code Extension `zero-token-tts` läuft dauerhaft im Hintergrund.
- Sie hostet einen HTTP-Server auf Port 18765.
- Ein persistentes Audio-Panel (Web Audio API) spielt alle eingehenden Sprachdaten ab.
- gTTS (Google Text-to-Speech, Deutsch) wird lokal via Python ausgeführt.

## Wichtige Regeln

- **Führe TTS nach jeder Antwort aus**, nicht nur auf Anfrage.
- **Keine explizite Benutzeraktion nötig** — das Audio-Panel spielt automatisch.
- Wenn die Antwort sehr lang ist, lies trotzdem alles vor – kürze nicht.
- Wenn der Benutzer auf Deutsch schreibt, antworte ebenfalls auf Deutsch.
- Bei Fehlern (kein Internet, gTTS nicht verfügbar): erkläre dem Benutzer warum und schlage `espeak` als Fallback vor.
- **Achtung nach VS Code Reload:** Der Benutzer muss einmal im Audio-Panel auf "Aktivieren (Enter)" drücken (Tab-Taste zum Panel, dann Enter). Danach läuft alles automatisch.
