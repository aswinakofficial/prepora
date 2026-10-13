#!/usr/bin/env bash
# Migrates PRODUCTION for a PR, from this machine, before the PR is released
# (docs/specs/16-engineering-team.md, decision 5). The release agent runs it; the owner can too.
#
# Usage: scripts/team/migrate-prod.sh <pr>                 safe migrations only (agents)
#        scripts/team/migrate-prod.sh <pr> --allow-unsafe  the owner, after reading the migration
#
# It migrates only when:
#   1. the PR is open against main, green and up to date (so CI ran every test, e2e included, on a
#      fresh local database), and this checkout is exactly the PR's head with no local changes;
#   2. every migration production doesn't have yet only adds things: no data changes, drops or
#      renames (scripts/team/migration_data_check.py) and nothing Squawk flags (.squawk.toml). Both
#      checks come from main, so a PR can't loosen them. Anything else stops here: the agent asks
#      the owner, and the owner reruns with --allow-unsafe;
#   3. the migrations apply cleanly to the local database first.
# Then it migrates production (through scripts/env.sh production) and checks production has every
# migration in the journal. It never prints the database URL.
set -euo pipefail
cd "$(dirname "$0")/../.."
pr=${1:?usage: $0 <pr> [--allow-unsafe]}
allow_unsafe=false
[ "${2:-}" = "--allow-unsafe" ] && allow_unsafe=true
say() { printf '%s\n' "$*"; }
fail() { printf 'migrate-prod: %s\n' "$*" >&2; exit 1; }

[ -f .env.production ] || fail "no .env.production (see CONTRIBUTING.md → Environments)."

# 1. The PR is green, up to date, and is what's checked out.
json=$(gh pr view "$pr" --json state,baseRefName,mergeStateStatus,headRefOid,isDraft)
[ "$(jq -r .state <<<"$json")" = OPEN ] || fail "PR $pr isn't open."
[ "$(jq -r .baseRefName <<<"$json")" = main ] || fail "PR $pr doesn't target main."
[ "$(jq -r .isDraft <<<"$json")" = false ] || fail "PR $pr is a draft."
state=$(jq -r .mergeStateStatus <<<"$json")
[ "$state" = CLEAN ] || fail "PR $pr isn't green and up to date (mergeStateStatus=$state)."
head=$(jq -r .headRefOid <<<"$json")
[ "$(git rev-parse HEAD)" = "$head" ] || fail "this checkout isn't PR $pr's head ($head). Check it out first."
[ -z "$(git status --porcelain -- drizzle packages/db)" ] || fail "drizzle/ or packages/db has local changes."

# 2. Which migrations production doesn't have yet, and are they safe?
journal=$(jq '.entries | length' drizzle/meta/_journal.json)
have=$(scripts/team/prod-read.sh "select count(*) from drizzle.__drizzle_migrations")
say "Journal: $journal migrations. Production: $have."
if [ "$have" -ge "$journal" ]; then
  say "Production already has every migration. Nothing to do."
  exit 0
fi
mapfile -t files < <(jq -r ".entries[$have:][] | \"drizzle/\(.tag).sql\"" drizzle/meta/_journal.json)
say "To apply: ${files[*]}"

git fetch -q origin main
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git show origin/main:scripts/team/migration_data_check.py > "$tmp/data_check.py"
git show origin/main:.squawk.toml > "$tmp/squawk.toml"
unsafe=false
python3 "$tmp/data_check.py" "${files[@]}" || unsafe=true
if [ "$unsafe" = false ]; then
  npx -y squawk-cli@2 --config "$tmp/squawk.toml" "${files[@]}" || unsafe=true
fi
if [ "$unsafe" = true ] && [ "$allow_unsafe" = false ]; then
  fail "a migration isn't additive (see above). It needs the owner: they read it, then run
  scripts/team/migrate-prod.sh $pr --allow-unsafe"
fi

# 3. Apply locally first.
say "Applying to the local database…"
bash scripts/env.sh local pnpm -s db:migrate

# Then production.
say "Applying to production…"
bash scripts/env.sh production pnpm -s db:migrate
now=$(scripts/team/prod-read.sh "select count(*) from drizzle.__drizzle_migrations")
[ "$now" = "$journal" ] || fail "production has $now migrations; the journal has $journal."
say "Production migrated: $now of $journal migrations. Release with: scripts/team/release.sh $pr"
