FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

COPY tsconfig.json ./
COPY src ./src
COPY web-console ./web-console

RUN npm run build \
  && npm run ui:build \
  && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production \
    NOVA_HOME=/data

RUN groupadd --system --gid 10001 nova \
  && useradd --system --uid 10001 --gid nova --home-dir /data nova \
  && mkdir -p /data \
  && chown -R nova:nova /data

COPY --from=build --chown=nova:nova /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nova:nova /app/node_modules ./node_modules
COPY --from=build --chown=nova:nova /app/dist ./dist
COPY --from=build --chown=nova:nova /app/web-console/dist ./web-console/dist

USER nova
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js", "start", "--host", "0.0.0.0", "--port", "3000"]
