# Nova Live-Logs

Nova stellt redigierte Laufzeitereignisse über folgende lokale Admin-Endpunkte bereit:

```text
GET    /api/logs
DELETE /api/logs
GET    /api/logs/stream
```

`/api/logs/stream` verwendet Server-Sent Events. Der Speicherpuffer enthält maximal 500 Einträge.

Die Web-Konsole bietet Suche, Mindest-Loglevel, Pause, Auto-Scroll und eine lokale Funktion zum Leeren der Ansicht.

Cookies, Zugriffstokens sowie Authorization- und Cookie-Felder werden durch den zentralen Pino-Logger redigiert, bevor ein Ereignis in den Live-Puffer gelangt.
