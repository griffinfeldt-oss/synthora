#!/usr/bin/env bash
# Starts an isolated copy of Synthora for the browser tests: its own database
# (*_e2e, recreated from migrations and seeded), every external service simulated,
# its own build folder and port. Never touches the dev database.
set -euo pipefail
cd "$(dirname "$0")/.."

export DATABASE_URL="${E2E_DATABASE_URL:-postgresql://synthora:synthora@localhost:5432/synthora_e2e}"
export DIRECT_URL="$DATABASE_URL"
export MOCK_MODE=true
export APP_MODE=demo
export ADMIN_MFA=required
export NEXT_DIST_DIR=.next-e2e
export APP_URL="http://localhost:3100"
export NEXT_PUBLIC_APP_URL="$APP_URL"
export CRON_SECRET="e2e-cron-secret-not-for-production"
PORT=3100

name="${DATABASE_URL##*/}"
host="$(echo "$DATABASE_URL" | sed -E 's#^[a-z]+://[^@]*@([^:/]+).*#\1#')"
if [[ "$name" != *_e2e || ( "$host" != "localhost" && "$host" != "127.0.0.1" ) ]]; then
  echo "Refusing: end-to-end tests only use a local *_e2e database (got $host/$name)." >&2
  exit 1
fi

if ! psql "${DATABASE_URL%/*}/postgres" -Atc "SELECT 1 FROM pg_database WHERE datname='$name'" | grep -q 1; then
  createdb --maintenance-db="${DATABASE_URL%/*}/postgres" "$name"
fi
npx prisma migrate deploy >/dev/null
npm run db:seed >/dev/null
npm run gen >/dev/null
npx next build >/dev/null
exec npx next start -p "$PORT"
