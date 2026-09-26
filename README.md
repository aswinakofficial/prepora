# Prepora

**Prepare smarter** with previous-year exam questions, answers, and detailed explanations.

An SEO-first exam preparation platform for Kerala PSC, GATE, SSC JE, UPSC and more.

> **Project status.** Prepora is under active development and is not yet a finished product.
> [`docs/architecture/prepora-next-level-plan.md`](docs/architecture/prepora-next-level-plan.md) is
> an honest, evidence-based audit of what currently works versus what is UI/schema only, and
> [`docs/roadmap/engineering-roadmap.md`](docs/roadmap/engineering-roadmap.md) is the plan to close
> the gap. Read those before assuming a feature described below is fully wired end to end.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start + TanStack Router |
| UI | React + Tailwind CSS + Radix UI |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Validation | Zod |
| Scraping / ingestion | Python + FastAPI (`apps/scraper/`) — being replaced by the pipeline in the roadmap above |
| Content format | A Markdown spec (`agents/content/schema.md`) with a parser and validator in `packages/content/`; not yet wired to the database — see the roadmap |
| Auth | Better Auth |
| Language | TypeScript (web + packages), Python (scraper) |

---

## Getting Started

You need **Node.js 22**, **pnpm 9**, **Python 3.12** and **PostgreSQL 14+** installed. Then:

```bash
git clone https://github.com/aswinakofficial/prepora.git
cd prepora
pnpm bootstrap      # installs everything, creates a local database with demo data, writes .env
pnpm dev            # http://localhost:3000
```

`pnpm bootstrap` sets up a local admin account for the admin area (credentials in your `.env`). No
admin rights for PostgreSQL? Use `pnpm bootstrap --project-db`. The full guide — per-OS installs,
manual setup, troubleshooting, and how to contribute — is in **[CONTRIBUTING.md](CONTRIBUTING.md)**.

---

## Content Pipeline

```bash
# Validate content files
pnpm content:validate

# Check for duplicate questions
pnpm content:duplicates

# Import to database
pnpm content:import

# Generate sitemaps
pnpm content:sitemap

# Content health report
pnpm content:report
```

Content files live in `content/exams/` and `content/question-sets/`.

See `agents/content/schema.md` for the Prepora Markdown format.

---

## Project Structure

```
prepora/
├── apps/
│   ├── web/            # TanStack Start web application
│   │   └── app/
│   │       ├── routes/     # File-based routes (public + admin)
│   │       ├── components/ # React components
│   │       └── styles/     # Global CSS
│   └── scraper/        # Python FastAPI scraping service (local-only; see roadmap)
│
├── packages/
│   ├── db/             # Drizzle ORM schema + client
│   ├── api/            # oRPC routers (exams, questions, admin)
│   ├── auth/           # Better Auth instance + authorization helpers
│   ├── content/        # Markdown parser + Zod schemas + validation
│   └── config/         # Shared TypeScript config
│
├── agents/content/     # Content Agent documentation
│   ├── AGENT.md        # Agent instructions
│   ├── schema.md       # Markdown format spec
│   ├── rules.md        # Content rules
│   └── examples/       # Example content files
│
├── docs/
│   ├── architecture/   # Evidence-based architecture audit
│   └── roadmap/        # Dependency-ordered engineering roadmap
│
├── scripts/            # Developer CLI tools
├── content/            # Source Markdown content files
└── drizzle/            # Generated SQL migrations
```

---

## Development Phases

- [x] Phase 1 — Foundation (monorepo, TanStack Start, Tailwind, TypeScript)
- [x] Phase 2 — Domain model (PostgreSQL + Drizzle schema)
- [ ] Phase 3 — Content engine (parser + Zod + validation exist in `packages/content/`; not yet wired to write to the database — see the roadmap's "Markdown as a connector")
- [x] Phase 4 — Content Agent (agent docs + examples)
- [x] Phase 5 — Admin CMS (dashboard, layout)
- [ ] Phase 6 — Public platform (pages exist; several still render fixture data rather than the database — see the roadmap's "Retire the mock datasets")
- [ ] Phase 7 — Practice mode (UI works; results are not yet persisted to the database)
- [ ] Phase 8 — Community (contribution/comment/report UI exists; not yet wired to the database)
- [ ] Phase 9 — User accounts (Better Auth integration)
- [ ] Phase 10 — AI features
- [ ] Phase 11 — Full SEO (structured data, sitemaps live)
- [ ] Phase 12 — Analytics
- [ ] Phase 13 — Hardening + E2E tests

See the [architecture audit](docs/architecture/prepora-next-level-plan.md) for the evidence behind
each of these statuses, and the [roadmap](docs/roadmap/engineering-roadmap.md) for the plan to
complete them.

---

## Content Agent

Use an AI model (Claude, Gemini, GPT) with the prompt in `agents/content/AGENT.md`
to convert raw question papers into valid Prepora Markdown.

The agent **never invents answers** — it flags ambiguous content for human review.

---

## License

[MIT](LICENSE)
