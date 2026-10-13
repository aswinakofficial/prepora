#!/usr/bin/env python3
"""
Guardrails for Prepora's agent team (docs/specs/16-engineering-team.md, decision 3): a Claude Code
PreToolUse hook on Bash. It reads the tool call as JSON on stdin and exits 2 (block, with the reason
on stderr, which the agent sees) for commands only the Release workflow or the owner may run.
Everything else exits 0.

Blocked:
- pushing to main, and force-pushing (except --force-with-lease to a non-main branch);
- merging a PR (`gh pr merge`, or the merge API): merging happens only in the Release workflow;
- loading the root .env into a shell (it holds the PRODUCTION database URL), and psql against a
  non-local database. Read-only questions go through scripts/team/prod-read.sh;
- database writes (migrations, pushes, pipeline imports and publishing) unless the same
  sub-command sets DATABASE_URL to the LOCAL database;
- `rm -rf` on the home directory, the filesystem root, the repository itself or .git.

Each sub-command (split on newlines, `&&`, `||`, `;` and `|`) is checked on its own, after heredoc
bodies and comments are removed: text written to a file isn't a command.
"""
import json
import os
import re
import shlex
import sys

REPO = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))

# `DATABASE_URL=<local>` as an assignment for this sub-command, not E2E_DATABASE_URL or a comment.
LOCAL_DB = re.compile(
    r"(?:^|\s)(?:env\s+)?DATABASE_URL=(?:\S*(?:127\.0\.0\.1|localhost|\[::1\])\S*|"
    r"\$?\(bash\s+(?:\.\./)*scripts/dev-db\.sh\s+url\))"
)
DB_WRITES = re.compile(
    r"(db:migrate|db:push|db:reset|db:seed|drizzle-kit\s+(migrate|push)|"
    r"prepora_pipeline\.cli\s+(publish|import-markdown|sync-sources|gate-import|reprocess|prune|"
    r"media-sync))"
)
LOCAL_HOST = re.compile(r"@(127\.0\.0\.1|localhost|\[::1\])[:/]")


def block(reason: str) -> None:
    print(f"Blocked by the team guardrails (docs/specs/16-engineering-team.md): {reason}",
          file=sys.stderr)
    sys.exit(2)


def strip_heredocs(command: str) -> str:
    """A heredoc's body is text written to a file or a program, not a command to run."""
    kept: list[str] = []
    terminator = None
    for line in command.split("\n"):
        if terminator is not None:
            if line.strip() == terminator:
                terminator = None
            continue
        kept.append(line)
        heredoc = re.search(r"<<-?\s*['\"]?([A-Za-z_]\w*)['\"]?", line)
        if heredoc:
            terminator = heredoc.group(1)
    return "\n".join(kept)


def strip_comment(part: str) -> str:
    return re.sub(r"(^|\s)#.*$", "", part)


def parts_of(command: str) -> list[str]:
    raw = re.split(r"\n|&&|\|\||;|\|", strip_heredocs(command))
    return [p for p in (" ".join(strip_comment(r).split()) for r in raw) if p]


def check_rm(part: str) -> None:
    try:
        words = shlex.split(part)
    except ValueError:
        words = part.split()
    if not words or words[0] != "rm":
        return
    flags = "".join(w[1:] for w in words[1:] if w.startswith("-") and not w.startswith("--"))
    if not ("r" in flags.lower() and "f" in flags) and "--recursive" not in words:
        return
    home = os.path.expanduser("~")
    for target in (w for w in words[1:] if not w.startswith("-")):
        expanded = os.path.expanduser(target.replace("$HOME", "~").replace("${HOME}", "~"))
        real = os.path.realpath(expanded) if expanded not in {"*"} else expanded
        if (
            target in {"*", ".", "..", "./", "../"}
            or real in {"/", home, REPO, os.path.dirname(home)}
            or real.rstrip("/").endswith("/.git")
            or target.rstrip("/").endswith(".git")
        ):
            block(f"`rm -rf {target}`. Delete specific paths only.")


def check_part(part: str) -> None:
    if re.search(r"\bgit\s+push\b", part):
        if re.search(r"(\s|:)(main|master)(\s|$)", part + " "):
            block("pushing to main. Push your branch and open a PR; the Release workflow merges.")
        if re.search(r"\s(--force|-f)(\s|$)", part + " "):
            block("force-pushing. Use --force-with-lease on your own branch, never on main.")
    if re.search(r"\bgh\s+pr\s+merge\b", part) or re.search(r"\bgh\s+api\b.*pulls/\d+/merge\b", part):
        block("merging a PR. Run /release <pr>: the Release workflow merges after its checks.")
    if (
        re.search(r"(^|\s)(\.|source)\s+(\./)?(\.\./)*\.env(\s|$)", part + " ")
        or re.search(r"--env-file[= ](\./)?(\.\./)*\.env\b.*\b(psql|tsx|drizzle)", part)
        or re.search(r"(export|xargs|eval)\b.*(\./)?(\.\./)*\.env\b", part)
        or re.search(r"(\./)?(\.\./)*\.env\b.*\|?\s*xargs", part)
    ):
        block(
            "loading the root .env (it points at PRODUCTION). For a read-only production question "
            "use scripts/team/prod-read.sh; for local work set "
            "DATABASE_URL=$(bash scripts/dev-db.sh url)."
        )
    if re.search(r"(^|\s)psql(\s|$)", part) and not part.startswith("scripts/team/prod-read.sh"):
        url = re.search(r"postgres(?:ql)?://\S+", part)
        if (url and not LOCAL_HOST.search(url.group(0))) or re.search(r"\$\{?DATABASE_URL", part):
            if not LOCAL_DB.search(part):
                block("psql against a database that isn't local. Use scripts/team/prod-read.sh "
                      "for read-only production questions.")
    if DB_WRITES.search(part) and not LOCAL_DB.search(part):
        block(
            "a database write without the LOCAL database. Prefix the same command with "
            "DATABASE_URL=$(bash scripts/dev-db.sh url) (fish: env DATABASE_URL=(bash "
            "scripts/dev-db.sh url) …). Production changes only through the Release workflow."
        )
    check_rm(part)


def main() -> None:
    try:
        call = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)
    if call.get("tool_name") != "Bash":
        sys.exit(0)
    for part in parts_of(call.get("tool_input", {}).get("command", "")):
        check_part(part)
    sys.exit(0)


if __name__ == "__main__":
    main()
