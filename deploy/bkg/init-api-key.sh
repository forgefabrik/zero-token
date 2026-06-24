#!/bin/sh
set -eu

STATE_DIR="${NOVA_STATE_DIR:-/state}"
KEY_FILE="$STATE_DIR/api.key"

mkdir -p "$STATE_DIR"
umask 077

if [ ! -s "$KEY_FILE" ]; then
  RANDOM_VALUE="$(od -An -N 32 -tx1 /dev/urandom | tr -d ' \n')"
  printf 'nova_%s\n' "$RANDOM_VALUE" > "$KEY_FILE"
fi

chmod 600 "$KEY_FILE"
echo "Nova API-Zugang wurde initialisiert: $KEY_FILE"
