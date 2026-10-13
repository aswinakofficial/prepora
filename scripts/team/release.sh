#!/usr/bin/env bash
# Starts the Release workflow for a PR (docs/specs/16-engineering-team.md, decision 5) and prints
# the run's URL. The workflow verifies, migrates production if needed, merges and checks the
# deploy; this script never merges or migrates anything itself.
# Usage: scripts/team/release.sh <pr> [--dry-run]
set -euo pipefail
pr=${1:?usage: $0 <pr> [--dry-run]}
dry=false; [ "${2:-}" = "--dry-run" ] && dry=true
gh workflow run release.yml -f pr="$pr" -f dry_run="$dry"
sleep 5
run=$(gh run list --workflow release.yml --limit 1 --json databaseId,url --jq '.[0].url')
echo "Release run for PR #$pr (dry run: $dry): $run"
echo "Watch it with: gh run watch $(basename "$run")"
