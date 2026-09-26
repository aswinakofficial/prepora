#!/usr/bin/env bash
# Project-local PostgreSQL for development — a private Postgres server whose data lives in
# .data/postgres inside this repository. Uses the Postgres you installed (initdb/pg_ctl), but needs
# no sudo, no system configuration and no changes to any other database; delete .data/postgres to
# start over. `pnpm bootstrap --project-db` uses this; you can also run it directly:
#
#   scripts/dev-db.sh start | stop | status | url | destroy
#
# It listens on 127.0.0.1 only, on port $PREPORA_PG_PORT (default 5544, so it never clashes with a
# system Postgres on 5432), with a `prepora` superuser and a `prepora_dev` database.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$REPO_ROOT/.data/postgres"
RUN_DIR="$REPO_ROOT/.data/postgres-run"
LOG_FILE="$REPO_ROOT/.data/postgres.log"
PORT="${PREPORA_PG_PORT:-5544}"
DB_USER="prepora"
DB_NAME="prepora_dev"

# initdb and pg_ctl are on PATH with Homebrew/Postgres.app, but on Debian/Ubuntu they live in
# /usr/lib/postgresql/<version>/bin. Prefer the newest installed version.
find_pg_bin() {
  if command -v pg_config >/dev/null 2>&1 && [ -x "$(pg_config --bindir)/initdb" ]; then
    pg_config --bindir
    return
  fi
  if command -v initdb >/dev/null 2>&1; then
    dirname "$(command -v initdb)"
    return
  fi
  local dir
  dir="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -n 1 || true)"
  if [ -n "$dir" ] && [ -x "$dir/initdb" ]; then
    echo "$dir"
    return
  fi
  echo "PostgreSQL server binaries (initdb, pg_ctl) not found. Install PostgreSQL 14 or newer — see CONTRIBUTING.md → \"Local development\"." >&2
  exit 1
}

PG_BIN="$(find_pg_bin)"

database_url() {
  echo "postgresql://$DB_USER@127.0.0.1:$PORT/$DB_NAME"
}

is_running() {
  [ -f "$DATA_DIR/postmaster.pid" ] && "$PG_BIN/pg_ctl" -D "$DATA_DIR" status >/dev/null 2>&1
}

cmd_start() {
  mkdir -p "$RUN_DIR"
  if [ ! -f "$DATA_DIR/PG_VERSION" ]; then
    echo "→ Creating a project-local Postgres cluster in .data/postgres ($("$PG_BIN/postgres" --version))"
    mkdir -p "$DATA_DIR"
    # trust auth is safe here: the server only listens on 127.0.0.1 and a socket inside this repo.
    "$PG_BIN/initdb" --username="$DB_USER" --auth=trust --encoding=UTF8 --locale=C \
      -D "$DATA_DIR" >/dev/null
  fi
  if is_running; then
    echo "✓ Project Postgres already running on 127.0.0.1:$PORT"
  else
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -l "$LOG_FILE" -w \
      -o "-p $PORT -k $RUN_DIR -c listen_addresses=127.0.0.1" start >/dev/null
    echo "✓ Project Postgres started on 127.0.0.1:$PORT (log: .data/postgres.log)"
  fi
  if ! "$PG_BIN/psql" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    "$PG_BIN/createdb" -h 127.0.0.1 -p "$PORT" -U "$DB_USER" "$DB_NAME"
    echo "✓ Created database $DB_NAME"
  fi
}

cmd_stop() {
  if is_running; then
    "$PG_BIN/pg_ctl" -D "$DATA_DIR" -m fast -w stop >/dev/null
    echo "✓ Project Postgres stopped"
  else
    echo "Project Postgres is not running"
  fi
}

cmd_status() {
  if is_running; then
    echo "running on 127.0.0.1:$PORT — $(database_url)"
  else
    echo "stopped"
    return 1
  fi
}

cmd_destroy() {
  cmd_stop || true
  rm -rf "$DATA_DIR" "$RUN_DIR" "$LOG_FILE"
  echo "✓ Removed .data/postgres — run 'scripts/dev-db.sh start' (or pnpm bootstrap --project-db) to recreate it"
}

case "${1:-}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  url) database_url ;;
  destroy) cmd_destroy ;;
  *)
    echo "usage: scripts/dev-db.sh start|stop|status|url|destroy" >&2
    exit 2
    ;;
esac
