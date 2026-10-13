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
# Within ALTER …: dropping a column (COLUMN is optional in Postgres) or renaming anything.
ALTER_UNSAFE = re.compile(
    r"\bDROP\b(?!\s+(?:DEFAULT|NOT\s+NULL|CONSTRAINT|INDEX|IDENTITY|EXPRESSION)\b)|\bRENAME\b",
    re.I,
)


def statements(sql: str) -> list[str]:
    sql = re.sub(r"--.*$", "", sql, flags=re.M)
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.S)
    return [" ".join(s.split()) for s in re.split(r";", sql) if s.strip()]


def unsafe_statements(sql: str) -> list[str]:
    return [
        s for s in statements(sql)
        if DATA.search(s) or (re.match(r"ALTER\b", s, re.I) and ALTER_UNSAFE.search(s))
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
