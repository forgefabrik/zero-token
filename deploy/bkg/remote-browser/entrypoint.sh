#!/bin/sh
set -eu

WIDTH="${NOVA_BROWSER_WIDTH:-1280}"
HEIGHT="${NOVA_BROWSER_HEIGHT:-900}"
DISPLAY_NUMBER="${DISPLAY#:}"

rm -f "/tmp/.X${DISPLAY_NUMBER}-lock"
rm -rf "/tmp/.X11-unix/X${DISPLAY_NUMBER}"

# Use a temporary profile directory to avoid profile lock issues
PROFILE_DIR="/tmp/chromium-profile-$$"
mkdir -p "$PROFILE_DIR"

Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" -ac +extension RANDR &
openbox-session >/tmp/openbox.log 2>&1 &
x11vnc \
  -display "$DISPLAY" \
  -forever \
  -shared \
  -nopw \
  -listen 0.0.0.0 \
  -rfbport 5900 \
  >/tmp/x11vnc.log 2>&1 &
websockify \
  --web=/usr/share/novnc/ \
  0.0.0.0:6080 \
  127.0.0.1:5900 \
  >/tmp/websockify.log 2>&1 &

# Start socat to forward CDP from 0.0.0.0:9222 to 127.0.0.1:9222
socat TCP-LISTEN:9222,reuseaddr,fork TCP:127.0.0.1:9222 &

# Start chromium with CDP on localhost (127.0.0.1)
chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-gpu \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$PROFILE_DIR" \
  --window-size="${WIDTH},${HEIGHT}" \
  --start-maximized \
  about:blank
