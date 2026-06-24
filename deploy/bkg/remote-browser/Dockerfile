FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    NOVA_BROWSER_WIDTH=1280 \
    NOVA_BROWSER_HEIGHT=900 \
    NOVA_BROWSER_MANAGER_PORT=9221

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    curl \
    novnc \
    openbox \
    python3 \
    socat \
    tint2 \
    websockify \
    x11vnc \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
COPY profile-manager.py /profile-manager.py
RUN chmod 0755 /entrypoint.sh /profile-manager.py \
  && mkdir -p /data/chromium/profiles

EXPOSE 6080 9221 9301-9313
VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=4s --start-period=25s --retries=8 \
  CMD curl -fsS http://127.0.0.1:9221/health >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
