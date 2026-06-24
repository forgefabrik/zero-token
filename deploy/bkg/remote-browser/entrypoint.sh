#!/bin/sh
set -eu

WIDTH="${NOVA_BROWSER_WIDTH:-1280}"
HEIGHT="${NOVA_BROWSER_HEIGHT:-900}"
DISPLAY_NUMBER="${DISPLAY#:}"

rm -f "/tmp/.X${DISPLAY_NUMBER}-lock"
rm -rf "/tmp/.X11-unix/X${DISPLAY_NUMBER}"
mkdir -p /data/chromium/profiles

Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" -ac +extension RANDR &
openbox-session >/tmp/openbox.log 2>&1 &
if command -v tint2 >/dev/null 2>&1; then
  tint2 >/tmp/tint2.log 2>&1 &
fi
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

exec python3 /profile-manager.py
