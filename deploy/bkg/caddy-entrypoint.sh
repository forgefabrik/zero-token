#!/bin/sh
set -eu

CADDY_ENV_FILE="/state/caddy.env"

for _ in $(seq 1 60); do
  if [ -s "$CADDY_ENV_FILE" ]; then
    break
  fi
  sleep 1
done

if [ ! -s "$CADDY_ENV_FILE" ]; then
  echo "Nova-Adminzugang wurde nicht erzeugt: $CADDY_ENV_FILE fehlt." >&2
  exit 1
fi

. "$CADDY_ENV_FILE"
export NOVA_WEB_USER NOVA_WEB_PASSWORD_HASH

exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
