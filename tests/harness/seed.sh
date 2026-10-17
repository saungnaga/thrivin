#!/usr/bin/env bash
# tests/harness/seed.sh — bring up the local test stand-in for Supabase.
#
#   ./tests/harness/seed.sh          # create db + apply migrations (idempotent)
#   ./tests/harness/seed.sh --fresh  # drop and recreate first
#
# Migrations applied in order:
#   001-core-schema.sql          users/subscriptions/subscription_plans (harness core)
#   002-webhook-onboarding.sql   webhook_events_inbox + onboarding_snapshots + purge (from staging/)
#   003-harness-grants.sql       harness-only: mirrors Supabase default grants
#   004-promo-codes.sql          promo dashboard/quota schema (copy from staging/)
#   005-wa-identity.sql          WA-first identity/OTP/session schema (copy from staging/)
#   008-feedback-kritiksaran.sql feedback table + grant/RLS (DRAFT copy from staging/)
#   009-harness-feedback-anon-grant.sql  harness-only: anon/authenticated get SELECT on
#                                the NEW table, exactly like Supabase. Without it the
#                                "anon cannot read feedback" test would pass for the
#                                wrong reason (no GRANT, not the RLS deny policy).
# Numbers 006/007 belong to the W4 checkout consent/cancel migrations; 008/009 were
# renumbered from the W5 branch's 004/005 so that no two migrations share a number
# after the RC merge (apply order is lexical).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DB="${HARNESS_PG_DB:-thrivin_remediation_test}"

FRESH=0
for a in "$@"; do [ "$a" = "--fresh" ] && FRESH=1; done

run_pg() { sudo -u postgres psql -v ON_ERROR_STOP=1 -d "$1" -q "${@:2}"; }

if [ "$FRESH" = "1" ]; then
  echo ">> dropping $DB"
  run_pg postgres -c "DROP DATABASE IF EXISTS $DB;"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB';" | grep -q 1; then
  echo ">> creating $DB"
  run_pg postgres -c "CREATE DATABASE $DB OWNER postgres;"
fi

# Keep the harness copies in lock-step with the schema under review. Copying
# (instead of hand-maintaining a second file) is what keeps the leak/quota tests
# honest: the harness runs the exact draft that is going to be applied.
cp "$REPO/staging/schema-webhook-onboarding.sql" "$HERE/migrations/002-webhook-onboarding.sql"
cp "$REPO/staging/schema-promo-codes.sql" "$HERE/migrations/004-promo-codes.sql"
cp "$REPO/staging/schema-wa-identity.sql" "$HERE/migrations/005-wa-identity.sql"
cp "$REPO/staging/schema-feedback-kritiksaran.sql" "$HERE/migrations/008-feedback-kritiksaran.sql"

for f in "$HERE"/migrations/*.sql; do
  echo ">> applying $(basename "$f")"
  # stdin, not -f: the file lives under /home/ubuntu which postgres cannot traverse.
  run_pg "$DB" -f - < "$f" >/dev/null
done

echo ">> done. tables:"
run_pg "$DB" -Atc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;"