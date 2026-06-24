#!/bin/sh
set -eu

cd "$(dirname "$0")"

export NOVA_CDP_URL="http://172.30.250.10:9222"
export NOVA_REMOTE_LOGIN_VIEW_URL="https://bkg.eysho.info/remote-browser/vnc.html?autoconnect=true&resize=remote&path=remote-browser/websockify"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ist nicht installiert." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose ist nicht verfügbar." >&2
  exit 1
fi

mkdir -p state
if [ ! -w state ]; then
  echo "Der Ordner $(pwd)/state ist nicht beschreibbar." >&2
  echo "Führe aus: sudo chown -R $(id -u):$(id -g) $(pwd)/state" >&2
  exit 1
fi
chmod 700 state

docker compose config >/dev/null
docker compose up -d --build --remove-orphans

echo
echo "Nova wurde gestartet."
echo "Webseite: https://bkg.eysho.info/"
echo "Remote Browser: https://bkg.eysho.info/remote-browser/"
echo "Zugangsdaten: $(pwd)/state/admin.data"
echo "Interne CDP-Adresse: ${NOVA_CDP_URL}"
echo
docker compose ps
