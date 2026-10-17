#!/usr/bin/env bash
# Stale promo reservation sweep (C-4) — fallback for environments without pg_cron.
#
# Supabase has pg_cron: schema-promo-codes.sql schedules the job itself (and
# raises a WARNING at apply time when the extension is missing). Anywhere else
# (self-hosted staging, ops VM) run this from cron, e.g.:
#   15 * * * *  /path/to/release-stale-promo-cron.sh >> /var/log/thrivin/promo-sweep.log 2>&1
#
# Without this, abandoned checkouts hold quota forever and a promo looks
# "sold out" while nobody bought anything. Mirrors staging/purge-cron.sh.
set -euo pipefail

: "${PGURL:?PGURL (postgres://...) must be set}"

psql "$PGURL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT 'promo sweep at ' || now() || ' released=' || release_stale_promo_reservations(24);"
