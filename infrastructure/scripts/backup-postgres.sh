#!/usr/bin/env sh
set -eu

: "${POSTGRES_HOST:?POSTGRES_HOST is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${BACKUP_DIRECTORY:?BACKUP_DIRECTORY is required}"

umask 077
mkdir -p "$BACKUP_DIRECTORY"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIRECTORY/pro-dessert-$timestamp.dump"

pg_dump --host "$POSTGRES_HOST" --username "$POSTGRES_USER" --format custom --no-owner --file "$target" "$POSTGRES_DB"
pg_restore --list "$target" >/dev/null
printf '%s\n' "$target"
