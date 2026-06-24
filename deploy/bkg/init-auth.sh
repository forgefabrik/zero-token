#!/bin/sh
set -eu

STATE_DIR="${NOVA_STATE_DIR:-/state}"
ADMIN_FILE="$STATE_DIR/admin.data"
CADDY_ENV_FILE="$STATE_DIR/caddy.env"
DOMAIN="${NOVA_DOMAIN:-bkg.eysho.info}"
HOST_UID="${NOVA_HOST_UID:-1000}"
HOST_GID="${NOVA_HOST_GID:-1000}"

mkdir -p "$STATE_DIR"
umask 077

random_hex() {
  od -An -N "$1" -tx1 /dev/urandom | tr -d ' \n'
}

if [ ! -s "$ADMIN_FILE" ] || [ ! -s "$CADDY_ENV_FILE" ]; then
  ADMIN_USER="admin-$(random_hex 4)"
  ADMIN_PASSWORD="$(random_hex 24)"
  PASSWORD_HASH="$(caddy hash-password --plaintext "$ADMIN_PASSWORD")"

  cat > "$ADMIN_FILE" <<EOF
NOVA ADMIN DATA
================

Domain: https://$DOMAIN
Login: https://$DOMAIN/
Remote Browser: https://$DOMAIN/remote-browser/

Admin Benutzer: $ADMIN_USER
Admin Passwort: $ADMIN_PASSWORD

Erstellt: $(date -u '+%Y-%m-%dT%H:%M:%SZ')

WICHTIG:
- Diese Datei enthält das Klartext-Passwort.
- Dateirechte müssen 600 bleiben.
- Für neue Zugangsdaten beide Dateien löschen und Compose neu starten:
  $ADMIN_FILE
  $CADDY_ENV_FILE
EOF

  cat > "$CADDY_ENV_FILE" <<EOF
NOVA_WEB_USER='$ADMIN_USER'
NOVA_WEB_PASSWORD_HASH='$PASSWORD_HASH'
EOF

  echo "Nova-Adminzugang wurde erstellt."
else
  echo "Nova-Adminzugang existiert bereits: $ADMIN_FILE"
fi

chown "$HOST_UID:$HOST_GID" "$ADMIN_FILE" "$CADDY_ENV_FILE"
chmod 600 "$ADMIN_FILE" "$CADDY_ENV_FILE"

echo "Zugangsdaten: $ADMIN_FILE"
