FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    NOVA_BROWSER_WIDTH=1280 \
    NOVA_BROWSER_HEIGHT=900

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    curl \
    novnc \
    openbox \
    websockify \
    x11vnc \
    xvfb \
  && rm -rf /var/lib/apt/lists/*

COPY entrypoint.sh /entrypoint.sh
RUN chmod 0755 /entrypoint.sh \
  && mkdir -p /data/chromium

EXPOSE 6080 9222
VOLUME ["/data"]

HEALTHCHECK --interval=10s --timeout=4s --start-period=25s --retries=8 \
  CMD curl -fsS http://127.0.0.1:9222/json/version >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
