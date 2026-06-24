#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy/bkg"
COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"
STATE_DIR="$DEPLOY_DIR/state"
NOVA_HASH_FILE="$STATE_DIR/nova-build.hash"
BROWSER_HASH_FILE="$STATE_DIR/remote-browser-build.hash"
BUILD_RESULT_FILE="$STATE_DIR/last-build.services"
MODE="${1:-auto}"

compose() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" "$@"
}

usage() {
  cat <<'EOF'
Verwendung: scripts/build.sh [auto|nova|remote-browser|all] [--no-cache]

  auto            Nur Images mit geänderten Eingabedateien bauen
  nova            Nur das Nova-Image bauen
  remote-browser  Nur das Remote-Browser-Image bauen
  all             Beide Images bauen
EOF
}

hash_inputs() {
  {
    for input in "$@"; do
      if [ -f "$input" ]; then
        printf '%s\n' "$input"
      elif [ -d "$input" ]; then
        find "$input" -type f \
          ! -path '*/node_modules/*' \
          ! -path '*/dist/*' \
          ! -path '*/coverage/*'
      fi
    done
  } | LC_ALL=C sort -u | while IFS= read -r file; do
    sha256sum "$file"
  done | sha256sum | awk '{print $1}'
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum ist nicht verfügbar." >&2
  exit 1
fi

case "$MODE" in
  auto|nova|remote-browser|all) ;;
  -h|--help) usage; exit 0 ;;
  *) echo "Unbekannter Build-Modus: $MODE" >&2; usage >&2; exit 1 ;;
esac
shift || true

compose config >/dev/null
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
: > "$BUILD_RESULT_FILE"
chmod 600 "$BUILD_RESULT_FILE"

NOVA_HASH="$(hash_inputs \
  "$REPO_ROOT/Dockerfile" \
  "$REPO_ROOT/.dockerignore" \
  "$REPO_ROOT/package.json" \
  "$REPO_ROOT/package-lock.json" \
  "$REPO_ROOT/tsconfig.json" \
  "$REPO_ROOT/src" \
  "$REPO_ROOT/web-console")"
BROWSER_HASH="$(hash_inputs "$DEPLOY_DIR/remote-browser")"

NOVA_BUILD=0
BROWSER_BUILD=0

case "$MODE" in
  nova) NOVA_BUILD=1 ;;
  remote-browser) BROWSER_BUILD=1 ;;
  all)
    NOVA_BUILD=1
    BROWSER_BUILD=1
    ;;
  auto)
    if [ ! -s "$NOVA_HASH_FILE" ] || [ "$(cat "$NOVA_HASH_FILE")" != "$NOVA_HASH" ]; then
      NOVA_BUILD=1
    fi
    if [ ! -s "$BROWSER_HASH_FILE" ] || [ "$(cat "$BROWSER_HASH_FILE")" != "$BROWSER_HASH" ]; then
      BROWSER_BUILD=1
    fi
    ;;
esac

if [ "$NOVA_BUILD" -eq 0 ] && [ "$BROWSER_BUILD" -eq 0 ]; then
  echo "Keine Image-relevanten Änderungen gefunden – kein Build nötig."
else
  if [ "$NOVA_BUILD" -eq 1 ]; then
    echo "Baue nur Nova …"
    compose build "$@" nova
    printf '%s\n' "$NOVA_HASH" > "$NOVA_HASH_FILE"
    printf '%s\n' "nova" >> "$BUILD_RESULT_FILE"
  fi

  if [ "$BROWSER_BUILD" -eq 1 ]; then
    echo "Baue nur Remote-Browser …"
    compose build "$@" remote-browser
    printf '%s\n' "$BROWSER_HASH" > "$BROWSER_HASH_FILE"
    printf '%s\n' "remote-browser" >> "$BUILD_RESULT_FILE"
  fi
fi

chmod 600 "$NOVA_HASH_FILE" "$BROWSER_HASH_FILE" "$BUILD_RESULT_FILE" 2>/dev/null || true

echo
echo "Selektiver Build abgeschlossen."
if [ -s "$BUILD_RESULT_FILE" ]; then
  echo "Neu gebaut: $(tr '\n' ' ' < "$BUILD_RESULT_FILE" | sed 's/ $//')"
fi
