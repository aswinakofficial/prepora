#!/usr/bin/env bash
# Runs a command against one environment (docs/specs/16-engineering-team.md, decision 5):
#
#   local       .env             the local database. The default for everything: development, tests,
#                                and every agent. Refuses to run if .env points anywhere else.
#   production  .env.production  the production database. Only for the owner's real scraping,
#                                ingestion and publishing (pnpm dev:prod), and for
#                                scripts/team/migrate-prod.sh. Agents can't run it (the guardrails).
#
# Usage: bash scripts/env.sh <local|production> <command…>
#
# Every variable in the chosen file is exported before the command starts. Node's --env-file,
# dotenv and python-dotenv never override a variable that's already set, so every process the
# command starts uses the chosen file. In production mode, a key only .env has is set to empty, so
# nothing local (the local admin login, say) leaks into a production run.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:?usage: scripts/env.sh <local|production> <command…>}
shift
[ $# -gt 0 ] || { echo "usage: scripts/env.sh <local|production> <command…>" >&2; exit 2; }

keys() { sed -n 's/^\(export \)\{0,1\}\([A-Za-z_][A-Za-z0-9_]*\)=.*/\2/p' "$1"; }
db_host() { sed -n 's/^DATABASE_URL=//p' "$1" | tail -n 1 | sed -E "s/^[\"']//; s/[\"']$//; s#^[a-z]+://([^@/]*@)?##; s#[:/].*##"; }
is_local() { case "$1" in 127.0.0.1|localhost|"[::1]") return 0 ;; *) return 1 ;; esac; }

case "$mode" in
  local)
    [ -f .env ] || { echo "No .env. Run: pnpm bootstrap" >&2; exit 1; }
    host=$(db_host .env)
    if ! is_local "$host"; then
      echo "Refusing: .env's DATABASE_URL isn't the local database. Production" >&2
      echo "settings belong in .env.production (see CONTRIBUTING.md → Environments)." >&2
      exit 1
    fi
    file=.env
    ;;
  production)
    [ -f .env.production ] || { echo "No .env.production (see CONTRIBUTING.md → Environments)." >&2; exit 1; }
    file=.env.production
    if [ -f .env ]; then
      for key in $(keys .env); do
        grep -q "^\(export \)\{0,1\}$key=" .env.production || export "$key="
      done
    fi
    export PREPORA_ENV=production
    ;;
  *)
    echo "Unknown environment '$mode': use local or production." >&2
    exit 2
    ;;
esac

set -a
# shellcheck disable=SC1090
. "./$file"
set +a
exec "$@"
