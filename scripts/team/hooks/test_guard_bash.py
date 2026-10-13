#!/usr/bin/env python3
"""Tests for guard_bash.py: every command that must be blocked is, and everyday commands aren't.
Run: python3 scripts/team/hooks/test_guard_bash.py (CI runs it)."""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).with_name("guard_bash.py")

BLOCKED = [
    "git push origin main",
    "git push origin HEAD:main",
    "git push --force",
    "git push -f origin feat/x",
    "gh pr merge 75 --merge",
    "cd /x && gh pr merge 12",
    "gh api -X PUT repos/aswinakofficial/prepora/pulls/75/merge",
    "set -a && . ./.env && psql $DATABASE_URL -c 'select 1'",
    "source .env; psql",
    "pnpm db:migrate",
    "pnpm db:push",
    "cd packages/db && npx drizzle-kit migrate",
    "venv/bin/python -m prepora_pipeline.cli gate-import --all-pilot",
    "python -m prepora_pipeline.cli publish --file q.json",
    "rm -rf ~",
    "rm -rf /",
    "rm -rf .git",
    "rm -fr ..",
    # A blocked command after a heredoc still counts.
    "cat > x.md <<'EOF'\ntext\nEOF\ngh pr merge 3",
]
ALLOWED = [
    "git push -u origin feat/intake",
    "git push --force-with-lease",
    "git push",
    "gh pr create --title x --body-file b.md",
    "gh pr checks 75",
    "gh api -X PUT repos/aswinakofficial/prepora/pulls/75/update-branch",
    "DATABASE_URL=$(bash scripts/dev-db.sh url) pnpm db:migrate",
    "env DATABASE_URL=(bash scripts/dev-db.sh url) pnpm db:migrate",
    "cd apps/pipeline && env DATABASE_URL=(bash ../../scripts/dev-db.sh url) venv/bin/python -m "
    "prepora_pipeline.cli gate-import --all-pilot",
    "DATABASE_URL=postgresql://prepora@127.0.0.1:5544/x pnpm db:migrate",
    "scripts/team/prod-read.sh 'select count(*) from questions'",
    "pnpm test && pnpm lint",
    "rm -rf test-results playwright-report",
    "rm -rf /tmp/claude-1000/scratch/x",
    "grep -n merge docs/specs/16-engineering-team.md",
    # Text inside a heredoc isn't a command.
    "cat > notes.md <<'EOF'\nNever run gh pr merge or git push --force here.\nEOF",
    "python3 - <<'PY'\nprint('pnpm db:migrate')\nPY",
]


def run(command: str) -> int:
    call = {"tool_name": "Bash", "tool_input": {"command": command}}
    return subprocess.run(
        [sys.executable, str(GUARD)], input=json.dumps(call), capture_output=True, text=True
    ).returncode


failures = [f"not blocked: {c!r}" for c in BLOCKED if run(c) != 2]
failures += [f"wrongly blocked: {c!r}" for c in ALLOWED if run(c) != 0]
for f in failures:
    print(f)
print(f"{len(BLOCKED) + len(ALLOWED) - len(failures)}/{len(BLOCKED) + len(ALLOWED)} cases pass")
sys.exit(1 if failures else 0)
