#!/usr/bin/env bash
# Proves a backup can actually be restored: dumps the database, restores it into
# a new scratch database, compares row counts for the money tables, then drops
# the scratch copy. Run it before launch and after any schema change.
#
#   DATABASE_URL=postgresql://... scripts/backup-restore-check.sh
#
# Needs pg_dump, pg_restore, psql and createdb/dropdb on the PATH, and a role
# allowed to create databases. It never writes to the source database.
set -euo pipefail

SRC="${DATABASE_URL:?Set DATABASE_URL to the database to back up}"
STAMP="$(date +%Y%m%d%H%M%S)"
SCRATCH_DB="synthora_restore_check_${STAMP}"
DUMP="$(mktemp -t synthora-backup-XXXXXX).dump"
BASE="${SRC%/*}"
SCRATCH_URL="${BASE}/${SCRATCH_DB}"

cleanup() { dropdb --if-exists --maintenance-db="$SRC" "$SCRATCH_DB" >/dev/null 2>&1 || true; rm -f "$DUMP"; }
trap cleanup EXIT

echo "1/4 Dumping…"
pg_dump --format=custom --no-owner --file="$DUMP" "$SRC"
echo "2/4 Creating scratch database ${SCRATCH_DB}…"
createdb --maintenance-db="$SRC" "$SCRATCH_DB"
echo "3/4 Restoring…"
pg_restore --no-owner --dbname="$SCRATCH_URL" "$DUMP"

echo "4/4 Comparing row counts…"
FAIL=0
for T in User Seller Listing ListingVersion Asset Order SellerOrder OrderItem Entitlement Payout LedgerEntry Operation Job SellerReceivable; do
  a=$(psql "$SRC" -Atc "SELECT count(*) FROM \"${T}\"")
  b=$(psql "$SCRATCH_URL" -Atc "SELECT count(*) FROM \"${T}\"")
  printf "  %-18s %8s %8s %s\n" "$T" "$a" "$b" "$([ "$a" = "$b" ] && echo ok || echo MISMATCH)"
  [ "$a" = "$b" ] || FAIL=1
done
la=$(psql "$SRC" -Atc 'SELECT COALESCE(SUM("amountCents"),0) FROM "LedgerEntry"')
lb=$(psql "$SCRATCH_URL" -Atc 'SELECT COALESCE(SUM("amountCents"),0) FROM "LedgerEntry"')
printf "  %-18s %8s %8s %s\n" "ledger sum" "$la" "$lb" "$([ "$la" = "$lb" ] && echo ok || echo MISMATCH)"
[ "$la" = "$lb" ] || FAIL=1

if [ "$FAIL" = 0 ]; then echo "Restore check passed."; else echo "Restore check FAILED."; exit 1; fi
