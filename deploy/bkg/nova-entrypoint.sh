#!/bin/sh
set -eu

export NOVA_CDP_URL="${NOVA_CDP_URL:-http://remote-browser:9222}"
export NOVA_REMOTE_LOGIN_VIEW_URL="${NOVA_REMOTE_LOGIN_VIEW_URL:-https://bkg.eysho.info/remote-browser/vnc.html?autoconnect=true&resize=remote&path=remote-browser/websockify}"

case "$NOVA_CDP_URL" in
  http://remote-browser:9222|https://*) ;;
  *)
    echo "Ungültige NOVA_CDP_URL: $NOVA_CDP_URL" >&2
    exit 1
    ;;
esac

case "$NOVA_REMOTE_LOGIN_VIEW_URL" in
  https://bkg.eysho.info/*) ;;
  *)
    echo "Ungültige NOVA_REMOTE_LOGIN_VIEW_URL: $NOVA_REMOTE_LOGIN_VIEW_URL" >&2
    exit 1
    ;;
esac

echo "Nova CDP: $NOVA_CDP_URL"
echo "Nova Remote Login: $NOVA_REMOTE_LOGIN_VIEW_URL"

exec "$@"
