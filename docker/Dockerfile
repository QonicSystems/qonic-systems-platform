# syntax=docker/dockerfile:1

# QONIC consulting — production image.
#
# Debian "slim" rather than Alpine on purpose: the app depends on @node-rs/argon2,
# a native module. The glibc (Debian) prebuilt is the best-tested one; Alpine's
# musl build occasionally surprises. The size difference is not worth the risk
# for an internal tool.
#
# The runner keeps the full dependency tree (not a trimmed "standalone" bundle)
# because the container also runs `prisma migrate deploy` and the tsx seed at
# start-up — those need the Prisma CLI and tsx present. For a small internal
# deployment that reliability is worth more than a few hundred MB.

FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# openssl is required by Prisma's engine tooling.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ── Build ────────────────────────────────────────────────────────────────────
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# next build imports server modules (e.g. lib/db.ts) which read these at load.
# The values are placeholders — nothing connects or encrypts at build time; the
# real values come from the environment at run time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
ENV NODE_ENV=production
RUN npx prisma generate && npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
# Run as the unprivileged user that the node image already ships.
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
ENTRYPOINT ["./docker-entrypoint.sh"]
