# syntax=docker/dockerfile:1

FROM node:22-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build


FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    TZ=Asia/Jakarta

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates sqlite3 tini \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app ./
RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/admin/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
# Web + worker (Discord gateway, Telegram long-poll, order poller) dalam satu container
# supaya satu-satunya file SQLite dipakai satu process tree.
CMD ["npx", "concurrently", "--kill-others", "next start -H 0.0.0.0 -p 3000", "tsx src/bot/index.ts"]
