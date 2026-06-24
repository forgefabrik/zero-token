#!/usr/bin/env python3
"""
TTS helper: reads text from stdin, generates German MP3,
creates HTML player, starts HTTP server, prints URL + opens in VS Code.
Usage: echo "Text" | python3 scripts/speak.py
"""
import sys
import base64
import os
import subprocess
import signal
import time
from gtts import gTTS

PORT = 8765
PID_FILE = "/tmp/tts_server.pid"
HTML_FILE = "tts_player.html"  # relative to workspace dir
WORKSPACE = os.environ.get("PWD", "/workspaces/zero-token")
HTML_PATH = os.path.join(WORKSPACE, HTML_FILE)
MP3_PATH = "/tmp/tts_output.mp3"

text = sys.stdin.read().strip()
if not text:
    sys.exit(0)

# Generate MP3
try:
    tts = gTTS(text, lang="de", slow=False)
    tts.save(MP3_PATH)
except Exception as e:
    print(f"TTS Fehler: {e}", file=sys.stderr)
    sys.exit(1)

# Read MP3 as base64
with open(MP3_PATH, "rb") as f:
    mp3_b64 = base64.b64encode(f.read()).decode()

safe_text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")

# HTML player with auto-play
html = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>🔊 Sprachausgabe</title>
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d1117; color: #e6edf3;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; padding: 1rem;
  }}
  .player {{
    max-width: 650px; width: 100%;
    background: #161b22; border: 1px solid #30363d;
    border-radius: 16px; padding: 2rem; text-align: center;
  }}
  h1 {{ font-size: 1.2rem; margin-bottom: 0.5rem; color: #58a6ff; }}
  audio {{ width: 100%; margin: 1rem 0; }}
  .text {{ font-size: 0.95rem; line-height: 1.6; color: #8b949e;
           text-align: left; padding: 1rem; background: #0d1117;
           border-radius: 8px; border: 1px solid #21262d;
           max-height: 350px; overflow-y: auto; }}
  .status {{ margin-top: 0.8rem; font-size: 0.8rem; color: #484f58; }}
</style>
</head>
<body>
<div class="player">
  <h1>🔊 Nova Sprachausgabe</h1>
  <audio id="player" autoplay controls>
    <source src="data:audio/mpeg;base64,{mp3_b64}" type="audio/mpeg">
  </audio>
  <div class="text">{safe_text}</div>
  <p class="status">▶ Automatische Wiedergabe</p>
</div>
</body>
</html>"""

with open(HTML_PATH, "w") as f:
    f.write(html)

# Start HTTP server (kill old one first)
if os.path.exists(PID_FILE):
    try:
        with open(PID_FILE) as f:
            old_pid = int(f.read().strip())
        os.kill(old_pid, signal.SIGTERM)
        time.sleep(0.3)
    except (ProcessLookupError, ValueError, OSError):
        pass
    os.remove(PID_FILE)

# Serve from workspace so VS Code can access the file too
server_proc = subprocess.Popen(
    [sys.executable, "-m", "http.server", str(PORT), "--directory", WORKSPACE],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
)
with open(PID_FILE, "w") as f:
    f.write(str(server_proc.pid))

# Construct URL
codespace = os.environ.get("CODESPACE_NAME", "")
domain = os.environ.get("GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN", "")
if codespace and domain:
    url = f"https://{codespace}-{PORT}.{domain}/{HTML_FILE}"
else:
    url = f"http://localhost:{PORT}/{HTML_FILE}"

# Try to open in VS Code via file
file_url = f"file://{HTML_PATH}"
print(f"TTS_URL={url}")
print(f"TTS_FILE={file_url}")
