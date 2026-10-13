#!/usr/bin/env bash
# Starts the Release workflow for a PR (docs/specs/16-engineering-team.md, decision 5) and prints
# the run's URL. The workflow verifies, migrates production if needed, merges and checks the
# deploy; this script never merges or migrates anything itself.
# Usage: scripts/team/release.sh <pr> [--dry-run]
set -euo pipefail
pr=${1:?usage: $0 <pr> [--dry-run]}
dry=false; [ "${2:-}" = "--dry-run" ] && dry=true
# A unique id in the run's name (release.yml's run-name), so we find exactly the run we started.
request="req-$(date +%s)-$$"
gh workflow run release.yml -f pr="$pr" -f dry_run="$dry" -f request_id="$request"
for _ in $(seq 1 30); do
  run=$(gh run list --workflow release.yml --limit 20 --json displayTitle,url \
    --jq ".[] | select(.displayTitle | endswith(\"$request\")) | .url" | head -1)
  if [ -n "$run" ]; then
    echo "Release run for PR #$pr (dry run: $dry): $run"
    echo "Watch it with: gh run watch $(basename "$run")"
    exit 0
  fi
  sleep 2
done
echo "Started the Release workflow, but couldn't find its run ($request) after 60 seconds." >&2
exit 1
