#!/usr/bin/env bash
# RX2-1a canary: consent schema applied to a DB that has 001-core-schema.sql only
# (no webhook schema). Post-fix must stop AT THE GUARD with a message naming
# schema-webhook-onboarding.sql; pre-fix stops later with generic errors while the
# retention function is still created (plpgsql body not validated at CREATE time).
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

psql_() { sudo -u postgres psql "$@"; }
fresh_db() {
  local db="$1"
  psql_ -q -c "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1
  psql_ -q -c "CREATE DATABASE $db OWNER postgres;"
  psql_ -q -d "$db" -f - < tests/harness/migrations/001-core-schema.sql >/dev/null 2>&1
}
probe() {
  local db="$1"
  echo -n "  pg_proc purge_expired_onboarding_progress : "
  psql_ -Atc "SELECT coalesce(string_agg(proname,','),'(kosong)') FROM pg_proc WHERE proname='purge_expired_onboarding_progress';" -d "$db"
  echo -n "  pg_views v_onboarding_retention_backlog   : "
  psql_ -Atc "SELECT count(*) FROM pg_views WHERE viewname='v_onboarding_retention_backlog';" -d "$db"
  echo -n "  pg_class purge_audit_log                  : "
  psql_ -Atc "SELECT count(*) FROM pg_class WHERE relname='purge_audit_log';" -d "$db"
}

echo "=== PRA-FIX (staging/schema-consent.sql @ HEAD, no guard) ==="
git show HEAD:staging/schema-consent.sql > /tmp/rx21a-prefix-consent.sql
fresh_db thrivin_rx21a_canary_prefix
psql_ -d thrivin_rx21a_canary_prefix -f - < /tmp/rx21a-prefix-consent.sql > /tmp/rx21a-prefix.log 2>&1
echo "  EXIT=$?  (tanpa ON_ERROR_STOP: 4x error generik, file jalan sampai habis)"
echo "  jumlah 'relation \"purge_audit_log\" does not exist' : $(grep -c 'relation "purge_audit_log" does not exist' /tmp/rx21a-prefix.log)"
grep -n 'ERROR' /tmp/rx21a-prefix.log | sed 's/^/  /'
probe thrivin_rx21a_canary_prefix

echo
echo "=== PASCA-FIX (staging/schema-consent.sql sekarang, ON_ERROR_STOP=1) ==="
fresh_db thrivin_rx21a_canary
psql_ -v ON_ERROR_STOP=1 -d thrivin_rx21a_canary -f - < staging/schema-consent.sql > /tmp/rx21a-canary.log 2>&1
echo "  EXIT=$?  (ON_ERROR_STOP=1, berhenti di guard)"
tail -2 /tmp/rx21a-canary.log | sed 's/^/  /'
probe thrivin_rx21a_canary
