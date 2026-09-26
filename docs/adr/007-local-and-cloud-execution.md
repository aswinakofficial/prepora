# ADR-007: Local and cloud execution

- **Status:** Accepted
- **Date:** 2026-09-21
- **Roadmap item:** [28 · Containerised worker and scheduler](../roadmap/engineering-roadmap.md)
  (P3 — gated on measured need)
- **Recommended in:** `docs/architecture/prepora-next-level-plan.md` §21, ADR-007

## Context

The pipeline (`apps/pipeline`) runs locally today: an operator invokes
`prepora-pipeline` (`apps/pipeline/prepora_pipeline/cli.py`) by hand or from local
cron/systemd. Item 28 asks whether to move execution to a container host so runs
happen in the cloud "without code changes."

Item 28's own text states the standing decision plainly: *"The confirmed decision
is local-only for now."* It also says that decision only becomes cheap to revisit
once four guarantees exist (§16 of `prepora-next-level-plan.md`), delivered by
items 12–14, which are complete. Verified directly against source, not assumed:

1. **CLI entry point** — `apps/pipeline/prepora_pipeline/cli.py` is a real
   `argparse` CLI (`prog="prepora-pipeline"`) with `reprocess`, `prune`,
   `sync-sources`, `publish`, `dedupe-check`, and `import-markdown` subcommands.
   Nothing about invoking a pipeline run depends on an interactive terminal or
   local-only tooling.
2. **Job state in Postgres** — `apps/pipeline/prepora_pipeline/core/jobs.py`
   (`create_job`, `start_job`, `complete_job`, `record_stage`, `list_jobs`,
   `list_stages`) reads and writes the `pipeline_jobs` / `pipeline_job_stages`
   tables (item 13). No in-memory job state exists; the admin UI
   (`apps/web/app/routes/admin/scraping.tsx`) already reads job history from the
   database, not a local file.
3. **Artifact store behind an interface** — `core/artifact_store.py` defines
   `ArtifactStore(ABC)` with `FilesystemArtifactStore` as the one implementation
   today. Swapping to S3/R2 is a second implementation of the same interface, not
   a refactor of every call site (item 12).
4. **Fully environment-driven configuration** — `core/registry.py` loads sources
   from per-connector `source.yaml` files (item 14) and only mutable operational
   state (enabled flag, crawl history, failure counts) lives in the `sources`
   table; nothing about which sites are crawlable is hardcoded in Python or
   TypeScript anymore. `core/db.py` reads `DATABASE_URL` and
   `core/security.py` reads its service token from the environment — no
   connection string or secret is hardcoded. `.env.example` already declares
   `STORAGE_ENDPOINT` / `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` /
   `STORAGE_BUCKET` / `STORAGE_REGION`, anticipating an S3/R2-compatible target
   without any code needing to change to start using them.

So the prerequisite work is done. What's being decided here is the separate
question item 28 and the P3 section header both pose explicitly: **is there a
measured need to actually build the container/deployment infrastructure now?**

## Decision

**Remain local-only.** Do not build `apps/pipeline/Dockerfile`,
`docker-compose.yml`, or any scheduled cloud execution at this time.

No measured need has been identified — there is no current requirement for the
pipeline to run unattended, on a schedule independent of an operator's machine,
or from more than one contributor's environment concurrently. The brief this
roadmap follows is explicit that "infrastructure added for appearance is a
negative signal" (echoed in item 29's identical framing for a job queue); building
Docker/Compose/container-host deployment now, with no run that actually needs it,
would be exactly that.

This ADR exists so that decision is a recorded, revisitable one rather than an
implicit default — and so that when a real need does appear, whoever picks this
up starts from "the four guarantees already hold, go build Architecture A"
instead of re-deriving whether the pipeline is cloud-ready.

## Alternatives considered

1. **Architecture A (item 28's own recommendation) — containers on a host,
   shared Neon Postgres, artifacts in R2/S3.** This is the target *if and when*
   justified. Web stays on Cloudflare Pages; pipeline workers run as containers
   against the same database; Docker Compose gives contributors a one-command
   local environment that mirrors it. Rejected for *now*, not rejected outright —
   see Consequences.
2. **Serverless functions per pipeline stage** (Cloudflare Workers, AWS Lambda).
   Rejected on architectural grounds, not just "no need yet": several stages are
   long-running and stateful — the Microsoft Learn connector drives a real
   browser session, and crawls are intentionally rate-limited — which is a poor
   fit for FaaS execution-time and memory ceilings without a genuine
   redesign. This would cost more than the Docker path it's meant to avoid.
3. **Managed workflow orchestration** (Temporal, Airflow, similar). Rejected as
   premature for the same reason item 29 rejects an external job queue:
   Postgres-backed job state with the existing per-stage counters already
   answers every operational question this project currently has. Adding an
   orchestrator now would itself be infrastructure built for appearance.
4. **Status quo — local-only, CLI-invoked.** Chosen.

## Trade-offs

- **Accepted cost:** the pipeline only runs when an operator's machine is
  available to run it. No genuinely unattended scheduled run exists yet, and no
  two contributors can trigger overlapping runs against a shared worker (each
  runs their own local process against the same Neon database, which the job
  table's idempotency key already makes safe — see item 13 — but there is no
  shared *compute*).
- **Accepted benefit:** zero Docker/Compose maintenance burden, no container
  registry or host to provision or pay for, and no secrets-in-a-container-host
  problem to solve before it's needed.
- **Not a sunk-cost trade:** the four guarantees above were built by items 12–14
  for reasons independent of cloud deployment — a content-addressed artifact
  store and durable job state make *local* runs more debuggable and
  reprocessable too. Deferring item 28 does not waste that work; it's exactly
  what makes deferring safe.

## Consequences

- `apps/pipeline/Dockerfile` and `docker-compose.yml` do not exist. A future
  implementer building them has no design decisions left to make about job
  state, artifact storage, or configuration — those are already settled — only
  the container/host/scheduler mechanics themselves.
- The `STORAGE_*` variables in `.env.example` stay unused by any running code
  until an S3/R2-backed `ArtifactStore` implementation is written alongside the
  container work.
- This decision should be revisited — and either reaffirmed or superseded by a
  new ADR — the moment a specific, measured need for cloud execution is
  identified (e.g., a scheduled run that must happen when no operator is
  available, or contributor load that a single local machine can no longer
  absorb in the available crawl window). Re-litigating this from scratch should
  not be necessary; the evidence above is the starting point.
