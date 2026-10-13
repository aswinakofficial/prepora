#!/usr/bin/env bash
# Migrates PRODUCTION for a PR, from this machine, before the PR is released
# (docs/specs/16-engineering-team.md, decision 5). The release agent runs it; the owner can too.
#
# Usage: scripts/team/migrate-prod.sh <pr>                 additive migrations only (agents)
#        scripts/team/migrate-prod.sh <pr> --allow-unsafe  the owner, after reading the migration
#
# Only main's code ever runs with the production URL: this script re-runs main's copy of itself, which
# works in a temporary checkout of origin/main and takes only drizzle/ from the PR. It migrates only
# when:
#   1. the PR is open against main, green and up to date (so CI ran every test, e2e included, on a
#      fresh local database), and changes no existing migration;
#   2. production's applied migrations are exactly the first ones in the PR's journal, matched by
#      timestamp (drizzle's `created_at` is the journal's `when`), and every migration it lacks is
#      additive: no data changes, drops or renames (migration_data_check.py), nothing Squawk flags.
#      Otherwise it stops: the agent asks the owner, and the owner reruns with --allow-unsafe;
#   3. the migrations apply cleanly to the local database first.
# Then it migrates production and checks production has exactly the journal's migrations. It never
# prints the database URL.
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
cd "$repo"
if [ "${PREPORA_MIGRATE_FROM_MAIN:-}" != 1 ]; then
  git fetch -q origin main
  exec env PREPORA_MIGRATE_FROM_MAIN=1 bash -c "$(git show origin/main:scripts/team/migrate-prod.sh)" \
    migrate-prod "$@"
fi

pr=${1:?usage: scripts/team/migrate-prod.sh <pr> [--allow-unsafe]}
allow_unsafe=false
[ "${2:-}" = "--allow-unsafe" ] && allow_unsafe=true
say() { printf '%s\n' "$*"; }
fail() { printf 'migrate-prod: %s\n' "$*" >&2; exit 1; }

[ -f .env.production ] || fail "no .env.production (see CONTRIBUTING.md → Environments)."

# 1. The PR is green and up to date, and only adds migrations.
json=$(gh pr view "$pr" --json state,baseRefName,mergeStateStatus,headRefOid,isDraft)
[ "$(jq -r .state <<<"$json")" = OPEN ] || fail "PR $pr isn't open."
[ "$(jq -r .baseRefName <<<"$json")" = main ] || fail "PR $pr doesn't target main."
[ "$(jq -r .isDraft <<<"$json")" = false ] || fail "PR $pr is a draft."
state=$(jq -r .mergeStateStatus <<<"$json")
[ "$state" = CLEAN ] || fail "PR $pr isn't green and up to date (mergeStateStatus=$state)."
head=$(jq -r .headRefOid <<<"$json")
git fetch -q origin "$head"
changed=$(git diff --name-only --diff-filter=DMR origin/main..."$head" -- 'drizzle/*.sql')
[ -z "$changed" ] || fail "PR $pr changes or removes existing migrations: $changed"

# main's code, the PR's migrations.
wt=$(mktemp -d)
cleanup() { git -C "$repo" worktree remove --force "$wt" >/dev/null 2>&1 || rm -rf "$wt"; }
trap cleanup EXIT
git worktree add -q --detach "$wt" origin/main
git -C "$wt" checkout -q "$head" -- drizzle/
ln -s "$repo/.env" "$wt/.env"
ln -s "$repo/.env.production" "$wt/.env.production"
cd "$wt"
pnpm install --frozen-lockfile --ignore-scripts --prefer-offline --silent

# 2. What production has, against the journal, by timestamp.
mapfile -t journal < <(jq -r '.entries[].when' drizzle/meta/_journal.json)
mapfile -t prod < <(scripts/team/prod-read.sh \
  "select created_at from drizzle.__drizzle_migrations order by created_at")
say "Journal: ${#journal[@]} migrations. Production: ${#prod[@]}."
for when in "${prod[@]}"; do
  printf '%s\n' "${journal[@]}" | grep -qx "$when" ||
    fail "production has a migration ($when) this PR's journal doesn't: another PR was migrated but
  isn't merged yet. Release that one first, then update this PR from main."
done
latest=0
[ ${#prod[@]} -eq 0 ] || latest=${prod[${#prod[@]}-1]}
files=()
for i in "${!journal[@]}"; do
  when=${journal[$i]}
  if [ "$when" -gt "$latest" ]; then
    files+=("drizzle/$(jq -r ".entries[$i].tag" drizzle/meta/_journal.json).sql")
  elif ! printf '%s\n' "${prod[@]}" | grep -qx "$when"; then
    # drizzle applies only migrations newer than production's latest, so this one never would be.
    fail "production lacks migration $(jq -r ".entries[$i].tag" drizzle/meta/_journal.json), which is older
  than production's latest: drizzle would skip it. The owner decides."
  fi
done
if [ ${#files[@]} -eq 0 ]; then
  say "Production already has every migration. Nothing to do."
  exit 0
fi
say "To apply: ${files[*]}"

unsafe=false
python3 scripts/team/migration_data_check.py "${files[@]}" || unsafe=true
if [ "$unsafe" = false ]; then
  npx -y squawk-cli@2 --config .squawk.toml "${files[@]}" || unsafe=true
fi
if [ "$unsafe" = true ] && [ "$allow_unsafe" = false ]; then
  fail "a migration isn't additive (see above). It needs the owner: they read it, then run
  scripts/team/migrate-prod.sh $pr --allow-unsafe"
fi

# 3. Apply locally first, then production.
say "Applying to the local database…"
bash scripts/env.sh local pnpm -s db:migrate
say "Applying to production…"
bash scripts/env.sh production pnpm -s db:migrate
now=$(scripts/team/prod-read.sh "select created_at from drizzle.__drizzle_migrations order by created_at")
[ "$now" = "$(printf '%s\n' "${journal[@]}")" ] ||
  fail "production's migrations don't match the journal after migrating. Tell the owner."
say "Production migrated: ${#journal[@]} migrations. Release with: scripts/team/release.sh $pr"
