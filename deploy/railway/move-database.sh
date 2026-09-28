#!/bin/sh
# Copy the whole shop database from one Postgres to another, and check it.
#
#   deploy/railway/move-database.sh "<FROM postgres URL>" "<TO postgres URL>"
#
# Used to move Abu Twins from the old Railway account to TechVaults'. Both URLs
# are the PUBLIC ones (Railway: the Postgres service, Variables,
# DATABASE_PUBLIC_URL, or a TCP proxy address). Needs Docker; runs Postgres 18
# tools, the same major version as both databases.
#
# The FROM database is only read. The TO database is backed up first, then
# emptied and loaded with FROM's data, every table's row count is compared,
# and this release's schema additions are applied on top. Stop sales on the
# FROM side first at the real switch-over, so nothing is missed.
set -eu

FROM="${1:?Give the FROM database URL first}"
TO="${2:?Give the TO database URL second}"
cd "$(dirname "$0")/../.."
WORK=$(mktemp -d)
chmod 700 "$WORK"
stamp=$(date +%Y%m%d-%H%M)
run() { docker run --rm -v "$WORK":/m postgres:18-alpine "$@"; }

echo "1/6 Backing up the TO database first ($WORK/to-before-$stamp.dump)"
run pg_dump -Fc --no-owner --no-acl "$TO" -f "/m/to-before-$stamp.dump"

echo "2/6 Snapshot of the FROM database (read only)"
run pg_dump -Fc --no-owner --no-acl "$FROM" -f /m/from.dump

COUNT_SQL="select string_agg(format('select %L t, count(*) n from public.%I', table_name, table_name), ' union all ' order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'"
Q=$(run psql "$FROM" -Atc "$COUNT_SQL")
run psql "$FROM" -Atc "$Q order by 1" > "$WORK/from.counts"

echo "3/6 Emptying the TO database"
run psql "$TO" -qc "drop schema public cascade; create schema public;"

echo "4/6 Loading the snapshot into it"
run pg_restore --no-owner --no-acl --exit-on-error -d "$TO" /m/from.dump

echo "5/6 Comparing every table, FROM against TO"
run psql "$TO" -Atc "$Q order by 1" > "$WORK/to.counts"
if diff "$WORK/from.counts" "$WORK/to.counts"; then
  echo "    Every table matches ($(wc -l < "$WORK/to.counts" | tr -d ' ') tables)."
else
  echo "    TABLES DIFFER. The TO backup is in $WORK. Stop and look before using it."
  exit 2
fi

echo "6/6 Adding this release's schema on top (never dropping data)"
node scripts/use-postgres-schema.mjs >/dev/null
DATABASE_URL="$TO" npx prisma db push --skip-generate

echo "Done. The TO backup taken in step 1 is at $WORK/to-before-$stamp.dump"
echo "Restart the app on the TO side so it starts on the moved data."
