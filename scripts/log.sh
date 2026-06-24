#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy/bkg"
COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"
TAIL_LINES="${NOVA_LOG_TAIL:-200}"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  set -- nova remote-browser caddy auth-init
fi

echo "Zeige die letzten $TAIL_LINES Zeilen und danach neue Logs live an."
echo "Beenden mit Strg+C."
echo

exec docker compose \
  --project-directory "$DEPLOY_DIR" \
  -f "$COMPOSE_FILE" \
  logs \
  --follow \
  --timestamps \
  --tail "$TAIL_LINES" \
  "$@"
