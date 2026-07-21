#!/bin/sh
# Start-up sequence for the app container.
#
# 1. Apply any pending database migrations (safe to run every boot — a no-op
#    when the schema is already current).
# 2. Seed roles, permissions, and the bootstrap CEO. The seed is idempotent and
#    only creates the CEO when the user table is empty, so re-running is safe.
# 3. Start the Next.js server.
#
# If a step fails the container exits non-zero rather than serving a half-ready
# app, so the orchestrator restarts it and the failure is visible.
set -e

echo "→ Applying database migrations..."
npx prisma migrate deploy

echo "→ Seeding roles, permissions, and bootstrap CEO (idempotent)..."
npx tsx prisma/seed.ts

echo "→ Seeding public holidays (idempotent)..."
npx tsx prisma/seed-holidays.ts || echo "  (holiday seed skipped)"

echo "→ Starting server on ${PORT:-3000}..."
exec npm run start
