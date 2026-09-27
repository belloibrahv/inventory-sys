#!/bin/sh
# Start-up for the Hostinger container. Same jobs as Railway's start command,
# with one difference that matters: the schema step never accepts data loss.
#
# Railway runs `prisma db push --accept-data-loss`, which would silently drop a
# column that a new release renamed. Here the push refuses anything
# destructive, the container stops, and the log says why, with the shop data
# untouched. Fix the release or move the data first, then start again.
set -eu

# Before the schema step, as on Railway: it clears duplicate day closes so a
# unique shop+day rule can go on. On a brand-new empty database there is no
# table yet and nothing to heal, so a failure here is only a warning; if it
# failed on real data, the careful push below refuses and stops instead.
echo "[start] Healing any duplicate day closes"
npx tsx scripts/heal-day-closes.ts || echo "[start] Nothing to heal yet (new database?), carrying on"

echo "[start] Bringing the database in line with this release (never dropping data)"
npx prisma db push --skip-generate

echo "[start] Shops, settings and role permissions"
npx tsx prisma/seed-users.ts

echo "[start] Serving on port ${PORT:-3000}"
exec npx next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
