#!/usr/bin/env python3
"""
Guardrails for Prepora's agent team (docs/specs/16-engineering-team.md, decision 3): a Claude Code
PreToolUse hook on Bash. It reads the tool call as JSON on stdin and exits 2 (block, with the reason
on stderr, which the agent sees) for commands only the Release workflow or the owner may run.
Everything else exits 0.

Blocked:
- pushing to main, and force-pushing (except --force-with-lease to a non-main branch);
- merging a PR (`gh pr merge`, or the merge API): merging happens only in the Release workflow;
- loading the root .env into a shell: it holds the PRODUCTION database URL. Read-only questions go
  through scripts/team/prod-read.sh;
- database writes (migrations, pushes, pipeline imports and publishing) unless DATABASE_URL is set
  to the LOCAL database in the same command;
- `rm -rf` on the home directory, the filesystem root, the repo itself or .git.
"""
import json
import re
import sys

LOCAL_DB = re.compile(
    r"DATABASE_URL=(\S*(127\.0\.0\.1|localhost|\[::1\])\S*|\$?\(bash scripts/dev-db\.sh url\)|"
    r"\(bash (\.\./)*scripts/dev-db\.sh url\)|\$\(bash (\.\./)*scripts/dev-db\.sh url\))"
)
DB_WRITES = re.compile(
    r"(db:migrate|db:push|db:reset|drizzle-kit\s+(migrate|push)|db:seed|"
    r"prepora_pipeline\.cli\s+(publish|import-markdown|sync-sources|gate-import|reprocess|prune|"
    r"media-sync))"
)


def block(reason: str) -> None:
    print(f"Blocked by the team guardrails (docs/specs/16-engineering-team.md): {reason}",
          file=sys.stderr)
    sys.exit(2)


def strip_heredocs(command: str) -> str:
    """A heredoc's body is text written to a file or a program, not a command to run, so it isn't
    checked (writing a test file full of blocked commands is fine)."""
    lines = command.split("\n")
    kept: list[str] = []
    terminator = None
    for line in lines:
        if terminator is not None:
            if line.strip() == terminator:
                terminator = None
            continue
        kept.append(line)
        heredoc = re.search(r"<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?", line)
        if heredoc:
            terminator = heredoc.group(1)
    return "\n".join(kept)


def check(command: str) -> None:
    cmd = " ".join(strip_heredocs(command).split())
    for part in re.split(r"\s*(?:&&|\|\||;|\n)\s*", cmd):
        if re.search(r"\bgit\s+push\b", part):
            if re.search(r"(\s|:)(main|master)(\s|$)", part + " "):
                block("pushing to main. Push your branch and open a PR; the Release workflow merges.")
            if re.search(r"\s(--force|-f)(\s|$)", part + " "):
                block("force-pushing. Use --force-with-lease on your own branch, never on main.")
        if re.search(r"\bgh\s+pr\s+merge\b", part) or re.search(
            r"\bgh\s+api\b.*pulls/\d+/merge\b", part
        ):
            block("merging a PR. Run /release <pr>: the Release workflow merges after its checks.")
        if re.search(r"(^|\s)(\.|source)\s+(\./)?(\.\./)*\.env(\s|$)", part + " ") or re.search(
            r"--env-file[= ](\./)?(\.\./)*\.env\b.*\b(psql|tsx|drizzle)", part
        ):
            block(
                "loading the root .env (it points at PRODUCTION). For a read-only production "
                "question use scripts/team/prod-read.sh; for local work set "
                "DATABASE_URL=$(bash scripts/dev-db.sh url)."
            )
        if DB_WRITES.search(part) and not LOCAL_DB.search(cmd):
            block(
                "a database write without the LOCAL database. Prefix the command with "
                "DATABASE_URL=$(bash scripts/dev-db.sh url) (fish: env DATABASE_URL=(bash "
                "scripts/dev-db.sh url) …). Production changes only through the Release workflow."
            )
        rm = re.search(r"\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)\s+(.+)", part)
        if rm:
            for target in rm.group(2).split():
                if target in {"/", "~", "$HOME", ".", "..", "*", "./", "../"} or target.rstrip(
                    "/"
                ).endswith(".git") or target in {"/home", "/home/aswinak"}:
                    block(f"`rm -rf {target}`. Delete specific paths only.")


def main() -> None:
    try:
        call = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    if call.get("tool_name") != "Bash":
        sys.exit(0)
    check(call.get("tool_input", {}).get("command", ""))
    sys.exit(0)


if __name__ == "__main__":
    main()
