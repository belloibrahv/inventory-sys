#!/bin/sh
# Copy the live shop data from Railway into this server's database.
#
#   cd deploy/hostinger
#   ./move-from-railway.sh "postgresql://...railway public URL..."
#
# Railway is only read from. This server's database is backed up first, then
# replaced with Railway's copy, then the row counts of the main tables are
# compared between the two. Run it once to rehearse, and once more at the
# switch-over, after stopping sales on Railway so nothing is missed.
set -eu

SOURCE_URL="${1:-}"
if [ -z "$SOURCE_URL" ]; then
  echo "Usage: ./move-from-railway.sh \"<Railway DATABASE_PUBLIC_URL>\""
  echo "Find it on Railway: the Postgres service, Variables, DATABASE_PUBLIC_URL."
  exit 1
fi

cd "$(dirname "$0")"
mkdir -p backups
stamp=$(date +%Y%m%d-%H%M)

echo "1/6 Backing up this server's database first (backups/before-move-$stamp.dump)"
docker compose exec -T db sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' > "backups/before-move-$stamp.dump"

echo "2/6 Stopping the app so nobody writes while the data moves"
docker compose stop app

echo "3/6 Copying Railway's database (read only on Railway's side)"
docker compose exec -T db pg_dump -Fc --no-owner --no-acl "$SOURCE_URL" > "backups/railway-$stamp.dump"
ls -lh "backups/railway-$stamp.dump"

echo "4/6 Loading it into this server's database"
docker compose exec -T db sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "backups/railway-$stamp.dump"

echo "5/6 Comparing row counts, Railway against here"
TABLES='"User" "Branch" "Product" "Inventory" "ImeiRecord" "Sale" "Payment" "Purchase" "Expense" "Customer" "AuditLog"'
mismatch=0
for table in $TABLES; do
  there=$(docker compose exec -T db psql "$SOURCE_URL" -Atc "select count(*) from $table")
  here=$(docker compose exec -T db sh -c "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -Atc 'select count(*) from $table'")
  if [ "$there" = "$here" ]; then flag="ok"; else flag="DIFFERENT"; mismatch=1; fi
  printf "  %-14s railway %8s   here %8s   %s\n" "$table" "$there" "$here" "$flag"
done

echo "6/6 Starting the app again"
docker compose start app

if [ "$mismatch" -ne 0 ]; then
  echo "Some tables differ. If sales were still going on Railway, that explains it; run this again after stopping them."
  exit 2
fi
echo "Done. Every table matches."
