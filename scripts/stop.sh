#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy/bkg"
COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"

compose() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" "$@"
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi

echo "Stoppe Nova-Stack …"
compose stop caddy nova remote-browser auth-init

echo
echo "Nova-Stack wurde gestoppt. Volumes und Zugangsdaten bleiben erhalten."
compose ps
