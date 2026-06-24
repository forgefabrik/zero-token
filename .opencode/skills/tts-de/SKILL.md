---
name: tts-de
description: >
  Text-to-Speech für Deutsch. IMMER verwenden wenn der Benutzer blind oder sehbehindert ist, oder wenn er darum bittet Inhalte vorzulesen. Auch verwenden wenn der Benutzer Deutsch spricht und "vorlesen", "sprich", "hör mal", "tts", "audio" sagt. Verwende diese Skill bei JEDER Antwort an den Benutzer, wenn bekannt ist dass er blind ist — lies jede Antwort automatisch vor. Nicht nur, wenn explizit darum gebeten wird.
---

# TTS für Deutsch (gTTS) — VS Code Player

Der Benutzer ist blind und spricht Deutsch. **Jede Antwort muss automatisch vorgelesen werden.**

## Wann immer du antwortest

1. **Schreibe deine Antwort normal** als Text – so wie sonst auch.
2. **Wandle den gesamten Antworttext in Sprache um** mit dem Skript:
   ```bash
   echo "Antworttext hier" | python3 .opencode/skills/tts-de/scripts/speak.py
   ```
3. **Öffne die Datei in VS Code** mit:
   ```bash
   code -r tts_player.html
   ```
4. **Gib dem Benutzer Bescheid**, dass die Datei geöffnet ist — er muss `Strg+Shift+V` (Vorschau) drücken, damit das Audio abgespielt wird.
5. **Gib auch die TTS_URL aus** als Fallback für den Browser.

## Verhalten

- Das Skript erzeugt eine MP3 mit gTTS (Deutsch), bettet sie in eine HTML-Player-Seite ein und startet einen HTTP-Server auf Port 8765.
- Die HTML-Datei wird im Workspace als `tts_player.html` abgelegt.
- Der Server läuft dauerhaft und wird bei jeder neuen Antwort aktualisiert.

## Wichtige Regeln

- **Führe TTS nach jeder Antwort aus**, nicht nur auf Anfrage.
- **Öffne die Datei in VS Code** und sag dem Benutzer er soll Vorschau öffnen (`Strg+Shift+V`).
- **Gib immer auch die Browser-URL aus** als Fallback.
- Wenn die Antwort sehr lang ist, lies trotzdem alles vor – kürze nicht.
- Wenn der Benutzer auf Deutsch schreibt, antworte ebenfalls auf Deutsch.
- Bei Fehlern (kein Internet, gTTS nicht verfügbar): erkläre dem Benutzer warum und schlage `espeak` als Fallback vor.
