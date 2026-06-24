#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
DEPLOY_DIR="$REPO_ROOT/deploy/bkg"
COMPOSE_FILE="$DEPLOY_DIR/compose.yaml"
STATE_DIR="$DEPLOY_DIR/state"
BUILD_MARKER="$STATE_DIR/last-build.sha"
MODE="${1:-auto}"

compose() {
  docker compose --project-directory "$DEPLOY_DIR" -f "$COMPOSE_FILE" "$@"
}

usage() {
  cat <<'EOF'
Verwendung: scripts/build.sh [auto|nova|remote-browser|all] [--no-cache]

  auto            Nur Images bauen, deren Dateien sich geändert haben (Standard)
  nova            Nur den Nova-Container bauen
  remote-browser  Nur den Remote-Browser bauen
  all             Beide Images bauen
EOF
}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "Git ist nicht installiert." >&2
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

NOVA_BUILD=0
BROWSER_BUILD=0

if [ "$MODE" = "nova" ]; then
  NOVA_BUILD=1
elif [ "$MODE" = "remote-browser" ]; then
  BROWSER_BUILD=1
elif [ "$MODE" = "all" ]; then
  NOVA_BUILD=1
  BROWSER_BUILD=1
else
  CURRENT_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
  BASE_SHA=""
  if [ -s "$BUILD_MARKER" ]; then
    BASE_SHA="$(cat "$BUILD_MARKER")"
    if ! git -C "$REPO_ROOT" cat-file -e "$BASE_SHA^{commit}" 2>/dev/null; then
      BASE_SHA=""
    fi
  fi

  if [ -z "$BASE_SHA" ]; then
    echo "Kein gültiger vorheriger Build gefunden – initialer Komplett-Build."
    NOVA_BUILD=1
    BROWSER_BUILD=1
  else
    CHANGED_FILES="$(
      {
        git -C "$REPO_ROOT" diff --name-only "$BASE_SHA".."$CURRENT_SHA"
        git -C "$REPO_ROOT" diff --name-only
        git -C "$REPO_ROOT" diff --name-only --cached
      } | sort -u
    )"

    if printf '%s\n' "$CHANGED_FILES" | grep -Eq '^(Dockerfile|package(-lock)?\.json|tsconfig.*\.json|src/|web-console/)'; then
      NOVA_BUILD=1
    fi
    if printf '%s\n' "$CHANGED_FILES" | grep -Eq '^deploy/bkg/remote-browser/'; then
      BROWSER_BUILD=1
    fi
  fi
fi

if [ "$NOVA_BUILD" -eq 0 ] && [ "$BROWSER_BUILD" -eq 0 ]; then
  echo "Keine Image-relevanten Änderungen gefunden – kein Build nötig."
else
  if [ "$NOVA_BUILD" -eq 1 ]; then
    echo "Baue nur Nova …"
    compose build "$@" nova
  fi
  if [ "$BROWSER_BUILD" -eq 1 ]; then
    echo "Baue nur Remote-Browser …"
    compose build "$@" remote-browser
  fi
fi

git -C "$REPO_ROOT" rev-parse HEAD > "$BUILD_MARKER"
chmod 600 "$BUILD_MARKER"

echo
echo "Selektiver Build abgeschlossen."
