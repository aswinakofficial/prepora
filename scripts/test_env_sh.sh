#!/usr/bin/env bash
# Tests scripts/env.sh on a throwaway copy with invented URLs; it never reads the real .env files.
# Run: bash scripts/test_env_sh.sh (CI runs it).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
mkdir "$dir/scripts"
cp "$here/env.sh" "$dir/scripts/env.sh"
cd "$dir"
fails=0
check() { if [ "$2" = "$3" ]; then echo "ok: $1"; else echo "FAIL: $1: got '$2', want '$3'"; fails=$((fails + 1)); fi; }

printf 'DATABASE_URL="postgresql://prepora@127.0.0.1:5544/prepora_dev"\nDEV_ADMIN_EMAIL=a@b.test\nSHARED=local\n' > .env
printf "DATABASE_URL='postgresql://u:p@ep-x.example.test/db?sslmode=require'\nSHARED=prod\n" > .env.production

check "local loads .env" "$(bash scripts/env.sh local sh -c 'echo "$SHARED $DEV_ADMIN_EMAIL"')" "local a@b.test"
check "production loads .env.production" \
  "$(bash scripts/env.sh production sh -c 'echo "$SHARED $PREPORA_ENV $DATABASE_URL"')" \
  "prod production postgresql://u:p@ep-x.example.test/db?sslmode=require"
check "production blanks keys only .env has" \
  "$(bash scripts/env.sh production sh -c 'echo "[${DEV_ADMIN_EMAIL-unset}]"')" "[]"

printf 'DATABASE_URL=postgresql://u:p@ep-x.example.test/db\n' > .env
check "local refuses a non-local .env" "$(bash scripts/env.sh local true >/dev/null 2>&1 && echo ran || echo refused)" "refused"
rm .env.production
check "production needs .env.production" \
  "$(bash scripts/env.sh production true >/dev/null 2>&1 && echo ran || echo refused)" "refused"
check "unknown environment" "$(bash scripts/env.sh staging true >/dev/null 2>&1 && echo ran || echo refused)" "refused"

[ "$fails" -eq 0 ] && echo "all env.sh cases pass" || exit 1
