#!/usr/bin/env bash
# Read-only questions about PRODUCTION (docs/specs/16-engineering-team.md, decision 3).
# Usage: scripts/team/prod-read.sh "select count(*) from questions"
# Connects with default_transaction_read_only=on, so any write fails, and never prints the URL.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ $# -eq 1 ] || { echo "usage: $0 \"<read-only SQL>\"" >&2; exit 1; }
url=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$url" ] || { echo "DATABASE_URL isn't set in .env" >&2; exit 1; }
PGOPTIONS="-c default_transaction_read_only=on" psql "$url" -v ON_ERROR_STOP=1 -At -c "$1"
