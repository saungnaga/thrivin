#!/usr/bin/env bash
# Retention purge for webhook PII (H-4) — fallback for environments without pg_cron.
#
# Supabase has pg_cron: schema-webhook-onboarding.sql schedules the job itself.
# Anywhere else (self-hosted staging, ops VM) run this from cron, e.g.:
#   0 3 * * *  /path/to/purge-cron.sh >> /var/log/thrivin/purge.log 2>&1
#
# Every run writes a row into purge_audit_log and echoes the deleted counts, so
# a silent failure shows up as a gap in v_webhook_retention_backlog.last_purge_at.
set -euo pipefail

: "${PGURL:?PGURL (postgres://...) must be set}"

psql "$PGURL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT 'purge at ' || now() || ' deleted_inbox=' || deleted_inbox || ' deleted_snapshots=' || deleted_snapshots FROM purge_expired_webhook_data();"