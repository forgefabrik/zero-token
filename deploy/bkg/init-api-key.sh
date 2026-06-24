#!/bin/sh
set -eu

STATE_DIR="${NOVA_STATE_DIR:-/state}"
KEY_FILE="$STATE_DIR/api.key"
HOST_UID="${NOVA_HOST_UID:-1000}"
RUNTIME_GID="${NOVA_RUNTIME_GID:-10001}"

mkdir -p "$STATE_DIR"
umask 077

if [ ! -s "$KEY_FILE" ]; then
  RANDOM_VALUE="$(od -An -N 32 -tx1 /dev/urandom | tr -d ' \n')"
  printf 'nova_%s\n' "$RANDOM_VALUE" > "$KEY_FILE"
fi

# Der Host-Benutzer bleibt Eigentümer. Die Nova-Gruppe darf die Datei lesen.
# So bleibt der Key auf dem Server geschützt und ist im Nova-Container lesbar.
chown "$HOST_UID:$RUNTIME_GID" "$STATE_DIR" "$KEY_FILE"
chmod 750 "$STATE_DIR"
chmod 640 "$KEY_FILE"

echo "Nova API-Zugang wurde initialisiert: $KEY_FILE"
