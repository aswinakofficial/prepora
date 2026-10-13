#!/usr/bin/env python3
"""
Does a migration change or remove data? (docs/specs/16-engineering-team.md, decision 5.) Squawk
checks schema changes, not data statements, so the Release workflow runs this first: a migration
that deletes, updates, inserts or truncates rows, or drops or renames a table, column, schema, type
or view, waits for the owner's approval however it's written. DROP INDEX and DROP CONSTRAINT are
left to Squawk, and foreign keys' `ON DELETE … ON UPDATE …` clauses aren't data statements.

Usage: migration_data_check.py FILE... Prints each unsafe statement; exits 1 if any, else 0.
"""
import re
import sys

DATA = re.compile(
    r"^(?:WITH\b.*\b(?:DELETE|UPDATE|INSERT)\b|DELETE|UPDATE|INSERT|TRUNCATE|COPY|MERGE)\b|"
    r"^DROP\s+(?:TABLE|SCHEMA|TYPE|VIEW|MATERIALIZED\s+VIEW)\b",
    re.I,
)
# Code runs inside procedural blocks, functions, triggers and rules, so their bodies can change
# data whatever they start with: any of them waits for the owner. So does a bare SELECT, CALL,
# PREPARE or EXECUTE, which can run such code.
CODE = re.compile(
    r"^(?:DO|CALL|SELECT|PREPARE|EXECUTE)\b|^CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?"
    r"(?:FUNCTION|PROCEDURE|TRIGGER|RULE|EVENT\s+TRIGGER)\b|\$\w*\$",
    re.I,
)
# Within ALTER …: dropping a column (COLUMN is optional in Postgres) or renaming anything.
ALTER_UNSAFE = re.compile(
    r"\bDROP\b(?!\s+(?:DEFAULT|NOT\s+NULL|CONSTRAINT|INDEX|IDENTITY|EXPRESSION)\b)|\bRENAME\b",
    re.I,
)


# One token of SQL: a dollar-quoted body or a string (kept whole, so a `;` or `--` inside doesn't
# count), a comment (dropped), a `;` (ends the statement), or any other character.
TOKEN = re.compile(
    r"(?P<body>\$(?P<tag>\w*)\$.*?\$(?P=tag)\$|'(?:[^']|'')*')|(?P<comment>--[^\n]*|/\*.*?\*/)|"
    r"(?P<end>;)|(?P<other>.)",
    re.S,
)


def statements(sql: str) -> list[str]:
    found, current = [], []
    for m in TOKEN.finditer(sql):
        if m.group("end"):
            found.append("".join(current))
            current = []
        elif not m.group("comment"):
            current.append(m.group(0))
    found.append("".join(current))
    return [" ".join(s.split()) for s in found if s.strip()]


def unsafe_statements(sql: str) -> list[str]:
    return [
        s for s in statements(sql)
        if DATA.search(s)
        or CODE.search(s)
        or (re.match(r"ALTER\b", s, re.I) and ALTER_UNSAFE.search(s))
    ]


def main(paths: list[str]) -> int:
    found = False
    for path in paths:
        with open(path, encoding="utf-8") as f:
            for s in unsafe_statements(f.read()):
                print(f"{path}: {s[:200]}")
                found = True
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
