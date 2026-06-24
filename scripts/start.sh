#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy/bkg"
COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"

export NOVA_CDP_URL="http://172.30.250.10:9222"
export NOVA_REMOTE_LOGIN_VIEW_URL="https://bkg.eysho.info/remote-browser/vnc.html?autoconnect=true&resize=remote&path=remote-browser/websockify"

compose() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" "$@"
}

fail_with_logs() {
  service="$1"
  echo "Dienst '$service' konnte nicht gestartet werden." >&2
  compose ps >&2 || true
  compose logs --tail=150 "$service" >&2 || true
  exit 1
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR/state"
if [ ! -w "$DEPLOY_DIR/state" ]; then
  echo "Der Ordner $DEPLOY_DIR/state ist nicht beschreibbar." >&2
  echo "Führe aus: sudo chown -R $(id -u):$(id -g) '$DEPLOY_DIR/state'" >&2
  exit 1
fi
chmod 700 "$DEPLOY_DIR/state"

compose config >/dev/null
"$REPO_ROOT/scripts/build.sh" auto
compose up -d --remove-orphans auth-init remote-browser nova
# Caddy bind-mountet seine Konfiguration. Ein gezieltes Recreate lädt Änderungen
# an Routing, TLS und Authentifizierung zuverlässig neu.
compose up -d --force-recreate caddy

for service in remote-browser nova caddy; do
  attempts=0
  while [ "$attempts" -lt 60 ]; do
    container_id="$(compose ps -q "$service")"
    if [ -n "$container_id" ]; then
      status="$(docker inspect -f '{{.State.Status}}' "$container_id" 2>/dev/null || true)"
      health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container_id" 2>/dev/null || true)"
      if [ "$status" = "running" ] && { [ "$health" = "healthy" ] || [ "$health" = "none" ]; }; then
        break
      fi
      if [ "$status" = "exited" ] || [ "$status" = "dead" ]; then
        fail_with_logs "$service"
      fi
    fi
    attempts=$((attempts + 1))
    sleep 2
  done

  if [ "$attempts" -ge 60 ]; then
    fail_with_logs "$service"
  fi
done

echo
echo "Nova-Stack läuft vollständig."
echo "Webseite: https://bkg.eysho.info/"
echo "API-Basis: https://bkg.eysho.info/v1"
echo "Modelle: https://bkg.eysho.info/v1/models"
echo "API-Key-Datei: $DEPLOY_DIR/state/api.key"
echo "Remote Browser: https://bkg.eysho.info/remote-browser/"
echo "Admin-Zugangsdaten: $DEPLOY_DIR/state/admin.data"
echo "Interne CDP-Adresse: $NOVA_CDP_URL"
echo
compose ps
