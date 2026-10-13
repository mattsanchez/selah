# syntax=docker/dockerfile:1

# The Selah app. Build and run it with `docker compose up`; see the README.
# No Bible text is in the image: first boot downloads it into the data volume.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The standalone server, and the entry point that migrates and runs first boot.
RUN NEXT_OUTPUT=standalone pnpm build && pnpm build:boot

FROM node:22-bookworm-slim AS app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 PORT=3000 SELAH_DATA_DIR=/data
WORKDIR /app
# Runs as the image's unprivileged "node" user. /data holds what first boot
# creates (the secret, the setup token, downloads); mount a volume there.
RUN mkdir /data && chown node:node /data
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/dist/boot.mjs ./boot.mjs
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "boot.mjs"]
