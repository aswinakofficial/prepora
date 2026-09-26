#!/usr/bin/env bash
# Prepora local development setup — `pnpm bootstrap` (named so because `pnpm setup` is a built-in
# pnpm command). See CONTRIBUTING.md → "Local development".
#
# Takes a fresh clone to a running app: checks the tools you need, installs dependencies, creates a
# local PostgreSQL database, writes .env, runs migrations and seeds demo data. Safe to re-run: every
# step skips what's already done, and an existing .env is never overwritten.
#
#   pnpm bootstrap                  use the PostgreSQL server you installed (creates a `prepora`
#                                   role and a `prepora_dev` database; on Linux asks for sudo once)
#   pnpm bootstrap --project-db     run a private Postgres for this project in .data/postgres
#                                   instead — no sudo, nothing configured outside this folder
#   pnpm bootstrap --with-browsers  also download Chromium for Microsoft Learn scraping (~150 MB)
#   pnpm bootstrap --yes            don't ask before running sudo (CI, scripted setups)
#   pnpm bootstrap:check            only check the environment; change nothing
#
# Works on macOS and Linux with bash 3.2+. On Windows, run it inside WSL2.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

DB_MODE="system"
CHECK_ONLY=0
ASSUME_YES=0
WITH_BROWSERS=0
SYSTEM_PG_PORT="${PREPORA_SYSTEM_PG_PORT:-5432}"
DEV_ADMIN_EMAIL_DEFAULT="admin@prepora.local"

for arg in "$@"; do
  case "$arg" in
    --project-db) DB_MODE="project" ;;
    --check) CHECK_ONLY=1 ;;
    --yes | -y) ASSUME_YES=1 ;;
    --with-browsers) WITH_BROWSERS=1 ;;
    -h | --help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown option: $arg (see pnpm bootstrap --help)" >&2
      exit 2
      ;;
  esac
done

# ─── Output helpers ─────────────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD=$'\033[1m' DIM=$'\033[2m' GREEN=$'\033[32m' YELLOW=$'\033[33m' RED=$'\033[31m' RESET=$'\033[0m'
else
  BOLD="" DIM="" GREEN="" YELLOW="" RED="" RESET=""
fi
step() { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
ok() { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$RESET" "$1"; }
hint() { printf '    %s%s%s\n' "$DIM" "$1" "$RESET"; }
die() {
  printf '  %s✗ %s%s\n' "$RED" "$1" "$RESET" >&2
  shift
  for line in "$@"; do hint "$line" >&2; done
  printf '\n%sSetup stopped.%s Fix the problem above and run it again — finished steps are skipped.\n' "$BOLD" "$RESET" >&2
  exit 1
}

OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux) PLATFORM="linux" ;;
  MINGW* | MSYS* | CYGWIN*)
    die "Native Windows isn't supported by this script." \
      "Install WSL2 (https://learn.microsoft.com/windows/wsl/install), open an Ubuntu shell, clone the repo there and run pnpm bootstrap."
    ;;
  *) PLATFORM="other" ;;
esac

LINUX_FLAVOR=""
if [ "$PLATFORM" = "linux" ] && [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  LINUX_FLAVOR="$(. /etc/os-release && echo "${ID_LIKE:-} ${ID:-}")"
fi

postgres_install_hint() {
  case "$PLATFORM" in
    macos) echo "brew install postgresql@16 && brew services start postgresql@16   (or Postgres.app: https://postgresapp.com)" ;;
    linux)
      case "$LINUX_FLAVOR" in
        *debian* | *ubuntu*) echo "sudo apt install postgresql" ;;
        *fedora* | *rhel*) echo "sudo dnf install postgresql-server postgresql && sudo postgresql-setup --initdb && sudo systemctl enable --now postgresql" ;;
        *arch*) echo "sudo pacman -S postgresql  (then initialise it: https://wiki.archlinux.org/title/PostgreSQL)" ;;
        *) echo "install PostgreSQL 14+ with your package manager" ;;
      esac
      ;;
    *) echo "install PostgreSQL 14+ (https://www.postgresql.org/download/)" ;;
  esac
}

# version_ge 20.11.0 20.6 → true when $1 >= $2
version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -t. -k1,1n -k2,2n -k3,3n | head -n1)" = "$2" ]
}

# Read KEY from .env (unquoted), empty when missing.
env_value() {
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env | tail -n 1 | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}

# ─── 1. Tools ───────────────────────────────────────────────────────────────────────────────────
check_tools() {
  step "Checking tools"

  command -v node >/dev/null 2>&1 ||
    die "Node.js is not installed." "Install Node.js 22 LTS: https://nodejs.org (or: nvm install 22)"
  local node_version
  node_version="$(node --version | sed 's/^v//')"
  version_ge "$node_version" "20.11.0" ||
    die "Node.js $node_version is too old — 20.11 or newer is required (22 LTS recommended)." \
      "With nvm: nvm install 22 && nvm use 22   (the repo's .nvmrc pins 22)"
  if version_ge "$node_version" "22.0.0"; then
    ok "Node.js $node_version"
  else
    ok "Node.js $node_version"
    warn "Node 22 LTS is recommended (.nvmrc); some tools, like wrangler, need it."
  fi

  command -v pnpm >/dev/null 2>&1 ||
    die "pnpm is not installed." "Enable it with Corepack (ships with Node): corepack enable" \
      "or see https://pnpm.io/installation"
  ok "pnpm $(pnpm --version)"

  command -v python3 >/dev/null 2>&1 ||
    die "Python 3 is not installed." "Install Python 3.11+ (3.12 recommended, see .python-version)."
  local py_version
  py_version="$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')"
  version_ge "$py_version" "3.11.0" ||
    die "Python $py_version is too old — 3.11 or newer is required." "Install Python 3.12 (see .python-version)."
  python3 -c 'import venv, ensurepip' >/dev/null 2>&1 ||
    die "Python's venv module is missing." "Debian/Ubuntu: sudo apt install python3-venv"
  ok "Python $py_version"

  if [ "$DB_MODE" = "project" ]; then
    # dev-db.sh exits non-zero from any command when it can't find initdb/pg_ctl.
    if ! bash scripts/dev-db.sh url >/dev/null 2>&1; then
      die "PostgreSQL server binaries (initdb, pg_ctl) were not found." "$(postgres_install_hint)"
    fi
    ok "PostgreSQL server binaries found (project-local database)"
  else
    command -v psql >/dev/null 2>&1 ||
      die "PostgreSQL is not installed (psql not found)." "$(postgres_install_hint)" \
        "No admin rights? Use a private project database instead: pnpm bootstrap --project-db"
    ok "PostgreSQL client $(psql --version | awk '{print $3}')"
  fi
}

# ─── 2. Dependencies ────────────────────────────────────────────────────────────────────────────
install_dependencies() {
  step "Installing dependencies"
  pnpm install --frozen-lockfile
  ok "Node packages"

  local app
  for app in pipeline scraper; do
    if [ ! -x "apps/$app/venv/bin/python" ]; then
      python3 -m venv "apps/$app/venv"
    fi
    "apps/$app/venv/bin/python" -m pip install --quiet --upgrade pip
    "apps/$app/venv/bin/python" -m pip install --quiet -r "apps/$app/requirements.txt"
    ok "Python environment apps/$app/venv"
  done

  if [ "$WITH_BROWSERS" = 1 ]; then
    apps/scraper/venv/bin/python -m playwright install chromium
    ok "Chromium for Microsoft Learn scraping"
  else
    hint "Microsoft Learn scraping needs a browser download (~150 MB); skip it unless you work on scraping."
    hint "Later: pnpm bootstrap --with-browsers"
  fi
}

# ─── 3. Database ────────────────────────────────────────────────────────────────────────────────
DB_URL=""

setup_system_database() {
  DB_URL="postgresql://prepora:prepora@localhost:$SYSTEM_PG_PORT/prepora_dev"
  if psql "$DB_URL" -tAc 'SELECT 1' >/dev/null 2>&1; then
    ok "Database prepora_dev is ready on localhost:$SYSTEM_PG_PORT"
    return
  fi

  if ! pg_isready -h localhost -p "$SYSTEM_PG_PORT" >/dev/null 2>&1; then
    die "No PostgreSQL server is running on localhost:$SYSTEM_PG_PORT." \
      "Start it — macOS: brew services start postgresql@16 · Linux: sudo systemctl start postgresql" \
      "Different port? PREPORA_SYSTEM_PG_PORT=5433 pnpm bootstrap · No admin rights? pnpm bootstrap --project-db"
  fi

  # Creating a role and database needs a Postgres superuser: the `postgres` OS user on Linux
  # (hence sudo), your own user with Homebrew/Postgres.app on macOS.
  local admin_psql
  if [ "$PLATFORM" = "macos" ]; then
    admin_psql="psql -h localhost -p $SYSTEM_PG_PORT -d postgres"
  else
    admin_psql="sudo -u postgres psql -p $SYSTEM_PG_PORT -d postgres"
    if [ "$ASSUME_YES" != 1 ]; then
      printf '  Create a "prepora" database user and a "prepora_dev" database?\n'
      printf '  This runs: %s%s%s (no other database is touched) [Y/n] ' "$DIM" "$admin_psql" "$RESET"
      local answer
      read -r answer
      case "$answer" in
        n* | N*) die "Cancelled." "Or use a private project database with no sudo: pnpm bootstrap --project-db" ;;
      esac
    fi
  fi

  # shellcheck disable=SC2086
  $admin_psql -v ON_ERROR_STOP=1 -q <<'SQL' ||
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prepora') THEN
    CREATE ROLE prepora LOGIN PASSWORD 'prepora' CREATEDB;
  END IF;
END
$$;
SELECT 'CREATE DATABASE prepora_dev OWNER prepora'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'prepora_dev')\gexec
SQL
    die "Could not create the prepora role/database." \
      "Run the command above yourself to see the full error, or use: pnpm bootstrap --project-db"

  psql "$DB_URL" -tAc 'SELECT 1' >/dev/null 2>&1 ||
    die "Created the database but can't log in to it as prepora with a password." \
      "Your pg_hba.conf may only allow 'peer' logins for localhost. Allow password (scram-sha-256)" \
      "logins for 127.0.0.1/32 and ::1/128, reload Postgres, and re-run — or use pnpm bootstrap --project-db"
  ok "Created database prepora_dev (user prepora) on localhost:$SYSTEM_PG_PORT"
}

setup_database() {
  step "Setting up the local database"
  if [ "$DB_MODE" = "project" ]; then
    bash scripts/dev-db.sh start | sed 's/^/  /'
    DB_URL="$(bash scripts/dev-db.sh url)"
  else
    setup_system_database
  fi
}

# ─── 4. .env ────────────────────────────────────────────────────────────────────────────────────
USING_LOCAL_DB=1

write_env() {
  step "Configuring .env"
  if [ -f .env ]; then
    ok ".env already exists — leaving it unchanged"
    local current
    current="$(env_value DATABASE_URL)"
    if [ "$current" != "$DB_URL" ]; then
      USING_LOCAL_DB=0
      warn "Your .env's DATABASE_URL points somewhere else, not at the database set up above."
      hint "To use the local database, set in .env:  DATABASE_URL=\"$DB_URL\""
      hint "Migrations and demo data below are skipped until then."
    fi
    return
  fi

  cp .env.example .env
  # Fill in working local values. Secrets are generated here, on your machine, and never leave it.
  DB_URL="$DB_URL" DEV_ADMIN_EMAIL="$DEV_ADMIN_EMAIL_DEFAULT" python3 - <<'PY'
import os, re, secrets
path = ".env"
text = open(path).read()
values = {
    "DATABASE_URL": os.environ["DB_URL"],
    "BETTER_AUTH_SECRET": secrets.token_hex(32),
    "PIPELINE_SERVICE_TOKEN": secrets.token_urlsafe(32),
    "ADMIN_USERS": os.environ["DEV_ADMIN_EMAIL"],
    "DEV_ADMIN_EMAIL": os.environ["DEV_ADMIN_EMAIL"],
    "DEV_ADMIN_PASSWORD": secrets.token_urlsafe(12),
    "NODE_ENV": "development",
}
for key, value in values.items():
    line = f'{key}="{value}"'
    text, n = re.subn(rf"^{key}=.*$", line, text, flags=re.M)
    if n == 0:
        text += f"\n{line}\n"
open(path, "w").write(text)
PY
  ok "Created .env with a local database URL and freshly generated secrets"
}

# ─── 5. Migrations + demo data ──────────────────────────────────────────────────────────────────
migrate_and_seed() {
  step "Preparing the database"
  if [ "$USING_LOCAL_DB" != 1 ]; then
    warn "Skipped (see the .env note above)."
    return
  fi
  pnpm --silent db:migrate >/dev/null
  ok "Migrations applied"
  (cd apps/pipeline && venv/bin/python -m prepora_pipeline.cli sync-sources >/dev/null)
  ok "Scrape sources registered"
  pnpm --silent db:seed:dev 2>&1 | grep -E '✓|•|⚠' | sed 's/^/  /' || true
}

# ─── Health check (pnpm bootstrap:check, and the end of every setup) ─────────────────────────────────────
run_checks() {
  step "Checking the environment"
  local failed=0 key
  if [ ! -f .env ]; then
    warn ".env is missing — run pnpm bootstrap"
    return 1
  fi
  for key in DATABASE_URL BETTER_AUTH_SECRET PIPELINE_SERVICE_TOKEN; do
    if [ -z "$(env_value "$key")" ]; then
      warn "$key is empty in .env"
      failed=1
    fi
  done

  local url
  url="$(env_value DATABASE_URL)"
  if [ -n "$url" ]; then
    if psql "$url" -tAc 'SELECT 1' >/dev/null 2>&1; then
      ok "Database reachable"
      local applied expected
      applied="$(psql "$url" -tAc 'SELECT count(*) FROM drizzle.__drizzle_migrations' 2>/dev/null || echo 0)"
      expected="$(grep -c '"tag"' drizzle/meta/_journal.json)"
      if [ "$applied" = "$expected" ]; then
        ok "Migrations up to date ($applied/$expected)"
      else
        warn "Migrations applied: $applied of $expected — run pnpm db:migrate"
        failed=1
      fi
    else
      warn "Can't connect to DATABASE_URL — is PostgreSQL running? (pnpm db:local status for --project-db)"
      failed=1
    fi
  fi

  local app
  for app in pipeline scraper; do
    if [ -x "apps/$app/venv/bin/python" ] &&
      (cd "apps/$app" && venv/bin/python -c 'import fastapi, psycopg2, pydantic' >/dev/null 2>&1); then
      ok "apps/$app Python environment"
    else
      warn "apps/$app/venv is missing or incomplete — run pnpm bootstrap"
      failed=1
    fi
  done
  return $failed
}

print_next_steps() {
  local email password
  email="$(env_value DEV_ADMIN_EMAIL)"
  password="$(env_value DEV_ADMIN_PASSWORD)"
  printf '\n%s✓ Ready.%s Start everything with:  %spnpm dev%s   (only the website: pnpm dev:web)\n' \
    "$GREEN$BOLD" "$RESET" "$BOLD" "$RESET"
  printf '  Open http://localhost:3000'
  if [ -n "$email" ] && [ -n "$password" ]; then
    printf ' and sign in with %s / %s (local admin; both in .env)' "$email" "$password"
  fi
  printf '\n  Next: CONTRIBUTING.md — how to run checks, where things live, and how to open a PR.\n'
}

# ─── Main ───────────────────────────────────────────────────────────────────────────────────────
if [ "$CHECK_ONLY" = 1 ]; then
  check_tools
  if run_checks; then
    printf '\n%s✓ Environment looks good.%s\n' "$GREEN" "$RESET"
  else
    printf '\n%sSome checks failed%s — see above. Most are fixed by running pnpm bootstrap.\n' "$YELLOW" "$RESET"
    exit 1
  fi
  exit 0
fi

printf '%sPrepora local setup%s (%s database)\n' "$BOLD" "$RESET" "$([ "$DB_MODE" = project ] && echo "project-local" || echo "system PostgreSQL")"
check_tools
install_dependencies
setup_database
write_env
migrate_and_seed
run_checks || warn "Some checks failed — see above."
print_next_steps
