# Contributing to Prepora

Thanks for helping build Prepora — an open exam-preparation platform. Every contribution counts: a
bug report, a typo fix, a new exam-source connector, a UI improvement, or better docs.

- **Questions and ideas:** open a GitHub Discussion or an issue.
- **Found a security problem?** Please report it privately via GitHub's "Report a vulnerability"
  on the Security tab, not in a public issue.

## Contents

1. [Local development](#local-development) — get the app running in about 10 minutes
2. [Where things live](#where-things-live)
3. [Making a change](#making-a-change) — checks to run, commits, pull requests
4. [Content and scraping policy](#content-and-scraping-policy)
5. [Troubleshooting](#troubleshooting)

---

## Local development

Everything runs on your machine against a **local PostgreSQL database** with invented demo data.
You don't need access to any hosted service, and you can't break the live site from a local setup.

### 1. Install the prerequisites

| Tool | Version | Why |
|---|---|---|
| [Node.js](https://nodejs.org) | 22 LTS (20.11+ works) | The web app and tooling. `.nvmrc` pins 22 — `nvm use` picks it up. |
| [pnpm](https://pnpm.io/installation) | 9 | Package manager. Easiest: `corepack enable` (ships with Node). |
| [Python](https://www.python.org/downloads/) | 3.12 (3.11+ works) | The scraper and the publishing pipeline. |
| [PostgreSQL](https://www.postgresql.org/download/) | 14 or newer | The database. |
| Git, bash | any recent | macOS and Linux have them; on Windows use WSL2 (below). |

**Installing PostgreSQL**

- **macOS:** `brew install postgresql@16 && brew services start postgresql@16`
  (or install [Postgres.app](https://postgresapp.com)).
- **Ubuntu / Debian:** `sudo apt install postgresql python3-venv`
  (the service starts automatically).
- **Fedora:** `sudo dnf install postgresql-server postgresql && sudo postgresql-setup --initdb && sudo systemctl enable --now postgresql`
- **Windows:** install [WSL2](https://learn.microsoft.com/windows/wsl/install) with Ubuntu, then
  follow the Ubuntu steps *inside* WSL and clone the repository there.

### 2. Run the setup script

```bash
git clone https://github.com/aswinakofficial/prepora.git
cd prepora
pnpm bootstrap
```

`pnpm bootstrap` ([scripts/setup.sh](scripts/setup.sh)) is safe to re-run — it skips anything
already done and never overwrites an existing `.env`. It:

1. **Checks your tools** and tells you exactly what to install if something is missing.
2. **Installs dependencies:** Node packages, plus a Python virtual environment for each of
   `apps/pipeline` and `apps/scraper`.
3. **Creates a local database:** a `prepora` user and a `prepora_dev` database in the PostgreSQL
   you installed. On Linux it asks before running `sudo -u postgres psql` once to do this — no other
   database is touched.
4. **Writes `.env`** from [.env.example](.env.example) with a local database URL and freshly
   generated secrets.
5. **Runs migrations and seeds demo data:** two invented exams with question sets, and a
   **local admin account**.
6. **Checks the result** (the same checks as `pnpm bootstrap:check`).

**No admin rights, or don't want to touch your system PostgreSQL?** Use a private, project-local
database instead — it runs from the PostgreSQL you installed, but keeps its data in
`.data/postgres` inside the repo, on port 5544, with no sudo:

```bash
pnpm bootstrap --project-db
```

Manage it with `pnpm db:local start|stop|status|destroy`.

Working on **Microsoft Learn scraping**? Also download the browser it drives (~150 MB):
`pnpm bootstrap --with-browsers`.

### 3. Start the app

```bash
pnpm dev        # website (3000) + scraper service (8000) + publishing pipeline (8001)
pnpm dev:web    # just the website — enough for most frontend work
```

Open http://localhost:3000. To use the admin area, sign in with the **local admin account**: the
email and password are `DEV_ADMIN_EMAIL` and `DEV_ADMIN_PASSWORD` in your `.env`. The sign-in page
shows an email form for this in local development only; you can also create throwaway test users
there. Google sign-in is optional locally (see [Google sign-in](#optional-google-sign-in)).

### Useful commands

| Command | What it does |
|---|---|
| `pnpm bootstrap:check` | Checks tools, `.env`, database connection, migrations and Python environments. Changes nothing. |
| `pnpm db:migrate` | Applies new migrations to your database. |
| `pnpm db:generate` | Generates a migration after you change `packages/db/src/schema`. |
| `pnpm db:seed:dev` | Re-seeds demo data (idempotent). Refuses to run against a hosted Neon database. |
| `pnpm db:local destroy` then `pnpm bootstrap --project-db` | Start over with an empty project-local database. |

### Setting it up by hand

Prefer not to run scripts? This is all `pnpm bootstrap` does:

```bash
pnpm install
python3 -m venv apps/pipeline/venv && apps/pipeline/venv/bin/pip install -r apps/pipeline/requirements.txt
python3 -m venv apps/scraper/venv && apps/scraper/venv/bin/pip install -r apps/scraper/requirements.txt

# Create a database user and database (any PostgreSQL 14+):
sudo -u postgres psql -c "CREATE ROLE prepora LOGIN PASSWORD 'prepora' CREATEDB"
sudo -u postgres psql -c "CREATE DATABASE prepora_dev OWNER prepora"

cp .env.example .env
# In .env: set BETTER_AUTH_SECRET and PIPELINE_SERVICE_TOKEN to random strings
#   (openssl rand -hex 32), and DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD / ADMIN_USERS for a local admin.
#   DATABASE_URL already points at postgresql://prepora:prepora@localhost:5432/prepora_dev.

pnpm db:migrate
(cd apps/pipeline && venv/bin/python -m prepora_pipeline.cli sync-sources)
pnpm db:seed:dev
```

### Optional: Google sign-in

Only needed if you're working on the Google login itself. Create an OAuth client ("Web
application") in the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
add `http://localhost:3000/api/auth/callback/google` as an authorised redirect URI, and put the ID
and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `.env`.

---

## Where things live

| Area | Location |
|---|---|
| Website (routes, pages, components) | `apps/web/app` — file-based routes in `apps/web/app/routes` (don't hand-edit `routeTree.gen.ts`) |
| API (oRPC routers, business logic) | `packages/api/src` |
| Database schema and client | `packages/db/src` — migrations in `drizzle/` |
| Authentication | `packages/auth/src` (Better Auth) |
| Publishing pipeline (validate, dedupe, publish) | `apps/pipeline/prepora_pipeline` |
| Exam-source connectors | `apps/pipeline/prepora_pipeline/connectors/<name>` — see [docs/connectors](docs/connectors/README.md) |
| Scraper service (FastAPI + Playwright) | `apps/scraper` |
| Architecture notes and decisions | `docs/architecture`, `docs/adr` |

---

## Making a change

1. **Pick something to work on.** Issues labelled `good first issue` are a good start. For anything
   bigger than a small fix, open an issue first so we can agree on the approach.
2. **Branch** from `main`: `git switch -c fix/short-description`.
3. **Run the checks** before you push — CI runs the same ones, and a PR can only merge when they pass:

   ```bash
   pnpm lint          # Biome (format + lint) and repo rules
   pnpm typecheck
   pnpm test          # unit tests (tests that need a database run when DATABASE_URL is set)

   # If you changed Python code:
   (cd apps/pipeline && venv/bin/ruff check . && venv/bin/pytest -q)
   (cd apps/scraper && venv/bin/ruff check . && venv/bin/pytest -q)
   ```

   `pnpm exec biome check --write .` fixes formatting for you.
4. **Commit** using [Conventional Commits](https://www.conventionalcommits.org):
   `feat(web): …`, `fix(api): …`, `docs: …`, `test: …`, `chore: …`. Explain *why* in the body when
   it isn't obvious.
5. **Open a pull request** against `main`. Describe what changed, why, and how you tested it
   (screenshots help for UI changes). Keep PRs focused — several small PRs review faster than one
   large one. Your branch needs to be up to date with `main` before it can merge.

Changed the database schema? Run `pnpm db:generate`, commit the generated migration in `drizzle/`,
and check it with `pnpm db:check`.

---

## Content and scraping policy

- **The repository contains code only — never scraped questions.** Scraped content lives in the
  database of whoever runs the scrapers. You're free to run the scrapers for your own instance;
  respect each source site's terms when you do.
- **Test fixtures use real markup with invented content.** When a connector needs a captured page
  for its tests, keep the HTML structure exactly as captured but replace every question, option,
  answer and explanation with invented text — see
  [docs/connectors](docs/connectors/README.md#layout) for how.
- **Demo data is invented too** ([scripts/dev-seed/content](scripts/dev-seed/content)). Add to it
  if a feature needs more realistic local data.
- **Research a source before writing a connector.** Every source gets a dossier in
  [docs/sources](docs/sources/README.md) covering its terms, structure, answers and third-party
  alternatives. Some sources are deliberately not used
  ([not-onboarded](docs/sources/not-onboarded.md)). Certification exams use only practice
  material the vendor itself publishes, never dump sites.
- **Third-party content is used only as its licence or terms allow.** A source we may only
  reference can be used to cross-check answers, never displayed. Explanations are written by
  contributors unless a source grants permission ([ADR-014](docs/adr/014-multi-source-provenance.md)).
- **AI-suggested answers and transcriptions** are optional and always confirmed by a reviewer
  before publishing, then labelled ([ADR-015](docs/adr/015-ai-assistance.md)).

---

## Troubleshooting

**`pnpm bootstrap:check` is the first thing to run** — it pinpoints most problems.

- **"No PostgreSQL server is running on localhost:5432"** — start it (macOS:
  `brew services start postgresql@16`; Linux: `sudo systemctl start postgresql`). Running on another
  port? `PREPORA_SYSTEM_PG_PORT=5433 pnpm bootstrap`.
- **"can't log in to it as prepora with a password"** — your `pg_hba.conf` only allows `peer`
  logins over localhost. Allow `scram-sha-256` for `127.0.0.1/32` and `::1/128` and reload
  PostgreSQL, or skip the system server entirely with `pnpm bootstrap --project-db`.
- **Port 5544 already in use** (project database) — `PREPORA_PG_PORT=5545 pnpm bootstrap --project-db`
  (and set the same variable when you use `pnpm db:local`).
- **"Python's venv module is missing"** — Debian/Ubuntu: `sudo apt install python3-venv`.
- **The scraper doesn't pick up code changes** — `uvicorn --reload` misses some; restart `pnpm dev`.
- **Sign-in page has no email form** — it only appears in local development (`pnpm dev`), by design.
- **Something else?** Open an issue with the output of `pnpm bootstrap:check`.
