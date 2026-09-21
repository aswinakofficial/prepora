# ADR-012: Job queue deferral

- **Status:** Accepted
- **Date:** 2026-09-21
- **Roadmap item:** [29 · Job queue — if and when justified](../roadmap/engineering-roadmap.md)
  (P3 — gated on measured need)
- **Numbering note:** `docs/architecture/prepora-next-level-plan.md` §21 recommends 11 ADRs
  (001–011) mapped to specific earlier decisions; several of those (e.g. 005 deduplication, 006
  search, 008 auth) were made while implementing their roadmap items but the ADRs documenting them
  were never written — that gap is real but is not this ADR's to close. This decision has no
  pre-assigned slot in that table, so it's numbered 012, after the highest reserved number, to
  avoid colliding with any of those still-unwritten ones.

## Context

Item 13 gave the pipeline durable, Postgres-backed job state: `pipeline_jobs` and
`pipeline_job_stages`, written exclusively through
`apps/pipeline/prepora_pipeline/core/jobs.py` (`create_job`, `start_job`,
`complete_job`, `record_stage`). `create_job` already does a database-backed
idempotency check — an `idempotency_key` reuses the existing job row instead of
creating a duplicate, replacing the old in-memory `seen_jobs` set that reset on
restart and meant nothing across processes.

Item 28 (ADR-007) just confirmed the pipeline continues to run as a single,
locally-invoked CLI process — there are no concurrent workers today, and no
container/cloud deployment. `apps/pipeline/prepora_pipeline/core/queue.py`
(item 29's "Affected" file) does not exist.

Item 29 asks whether a dedicated job queue (a broker like Redis/Celery,
RabbitMQ, or SQS, with its own worker pool) is needed to coordinate *concurrent*
job processing once workers exist. The item's own text is explicit that
Postgres's `SELECT ... FOR UPDATE SKIP LOCKED` pattern — a standard way to let
multiple workers safely claim distinct rows from one table without double-
processing — is available as a coordination primitive built entirely on the
`pipeline_jobs` table already in place, requiring no new infrastructure, *if*
concurrent workers are ever introduced. That pattern is not implemented today
(verified: no occurrence of `FOR UPDATE` or `SKIP LOCKED` anywhere in
`apps/pipeline`) because there is nothing yet that needs it — one process claims
its own work by construction.

## Decision

**Do not build a job queue.** No measured concurrency limit has been hit: there
is exactly one execution context (a local, operator-invoked CLI run) and no
observed double-processing, starvation, or throughput ceiling to justify moving
past Postgres-backed coordination. Per the roadmap's own instruction for this
item, an ADR recording that decision is the correct deliverable in the absence
of that evidence.

If and when multiple concurrent workers are introduced (most likely alongside
item 28's containerisation, should it ever be justified), the first-line
response is `SELECT ... FOR UPDATE SKIP LOCKED` against `pipeline_jobs` — not a
new broker.

## Alternatives considered

1. **Dedicated message queue/broker** (Celery+Redis, RabbitMQ, SQS, or similar).
   Rejected: this is real, ongoing infrastructure — a broker to run and monitor,
   a worker pool with its own deployment lifecycle, at-least-once vs.
   exactly-once delivery semantics to reason about — for a project with a single
   execution context today. Building it now would be exactly the "infrastructure
   added for appearance" the brief warns against.
2. **`SELECT ... FOR UPDATE SKIP LOCKED` over `pipeline_jobs`.** Not adopted
   *now* because there is no concurrency to coordinate, but recorded here as the
   designated next step: it needs no new infrastructure, works directly against
   the table item 13 already built, and is a well-understood Postgres pattern
   for exactly this "N workers, no double-processing" requirement item 29's
   testing section names.
3. **Status quo — single process, no coordination.** Chosen. `create_job`'s
   existing idempotency-key check already prevents duplicate job creation across
   restarts; nothing today calls it from more than one process at a time.

## Trade-offs

- **Accepted limitation:** the pipeline cannot currently be scaled horizontally
  — running two operators' CLI invocations against overlapping sources
  concurrently is only as safe as `create_job`'s idempotency-key check (a
  plain `SELECT` then `INSERT`, not itself race-free under true concurrent
  writers without a unique constraint). This has not mattered because there is
  only ever one invoker in practice.
- **Accepted benefit:** no broker to run, secure, monitor, or pay for; no new
  failure mode (a dead queue, a stuck consumer) introduced into a system that
  doesn't yet need the capability it would provide.
- **Not a sunk cost:** item 13's job-state work is the prerequisite for *either*
  path (a queue or `SKIP LOCKED` coordination both need durable job rows to
  coordinate over) — nothing here is wasted by deferring.

## Consequences

- `apps/pipeline/prepora_pipeline/core/queue.py` does not exist.
- `create_job`'s idempotency check should be hardened to a real unique
  constraint plus `ON CONFLICT` (or an equivalent atomic upsert) before any
  concurrent invocation is introduced — noted here as the one piece of
  item 13's work worth revisiting at that time, not before.
- This decision should be revisited — with a new ADR, not an edit to this one —
  the moment a specific, measured concurrency problem is identified: e.g., a
  documented case of double-processing, starvation between competing jobs, or a
  throughput ceiling that a single worker genuinely cannot clear in the
  available window. The ADR that supersedes this one should state that
  measurement directly, per item 29's own requirement.
