# Prepora

**Prepare smarter** with previous-year exam questions, answers, and detailed explanations.

An SEO-first exam preparation platform for Kerala PSC, GATE, SSC JE, UPSC and more.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start + TanStack Router |
| UI | React + Tailwind CSS + shadcn/ui |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod + Conform |
| Content | Markdown → Parser → Zod → PostgreSQL |
| Auth | Better Auth |
| Language | TypeScript (throughout) |

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL database

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL and other secrets

# Generate and run migrations
pnpm db:generate
pnpm db:migrate

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

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
├── apps/web/           # TanStack Start web application
│   └── app/
│       ├── routes/     # File-based routes (public + admin)
│       ├── components/ # React components
│       └── styles/     # Global CSS
│
├── packages/
│   ├── db/             # Drizzle ORM schema + client
│   ├── content/        # Markdown parser + Zod schemas + validation
│   └── config/         # Shared TypeScript config
│
├── agents/content/     # Content Agent documentation
│   ├── AGENT.md        # Agent instructions
│   ├── schema.md       # Markdown format spec
│   ├── rules.md        # Content rules
│   └── examples/       # Example content files
│
├── scripts/            # Developer CLI tools
├── content/            # Source Markdown content files
└── drizzle/            # Generated SQL migrations
```

---

## Development Phases

- [x] Phase 1 — Foundation (monorepo, TanStack Start, Tailwind, TypeScript)
- [x] Phase 2 — Domain model (PostgreSQL + Drizzle schema)
- [x] Phase 3 — Content engine (parser + Zod + validation)
- [x] Phase 4 — Content Agent (agent docs + examples)
- [x] Phase 5 — Admin CMS (dashboard, layout)
- [x] Phase 6 — Public platform (homepage, exam/question/subject/topic pages)
- [x] Phase 7 — Practice mode
- [x] Phase 8 — Community (contributions, reports)
- [ ] Phase 9 — User accounts (Better Auth integration)
- [ ] Phase 10 — AI features
- [ ] Phase 11 — Full SEO (structured data, sitemaps live)
- [ ] Phase 12 — Analytics
- [ ] Phase 13 — Hardening + E2E tests

---

## Content Agent

Use an AI model (Claude, Gemini, GPT) with the prompt in `agents/content/AGENT.md`
to convert raw question papers into valid Prepora Markdown.

The agent **never invents answers** — it flags ambiguous content for human review.
