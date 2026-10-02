# Prepora — Vision and goals

> **Every exam question in the world, in one place: sourced, verified, searchable, and used to help
> learners prepare for what comes next.**

Past exam questions are the most reliable way to prepare for an exam, and the hardest thing to
find. They're scattered across PDFs, forums and paywalled sites, rarely have trustworthy answers,
and almost never come with explanations. Prepora's goal is to become the **world's largest open,
trustworthy index of exam questions**, across countries, languages, exam bodies and levels, and to
make that knowledge useful to every learner for free.

This page is the "why" and the "where next". The order work happens in is
[docs/specs/README.md](specs/README.md); the architecture behind the index is
[docs/architecture/knowledge-index.md](architecture/knowledge-index.md); to get involved see
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## What we stand for

These decide the hard trade-offs. A change that breaks one of them needs a very good reason.

1. **Sourced, reviewed, always labelled.** Every question traces back to its origin, and every
   answer says where it came from: official key, reviewer, or AI-suggested and confirmed by a
   person ([ADR-015](adr/015-ai-assistance.md)). Nothing is published silently, and missing data is
   never filled in.
2. **Honest about uncertainty.** Predictions and AI help are always labelled, explained and
   measured.
3. **Open.** The code is MIT-licensed and built in public. The repository holds code, not scraped
   content, so anyone can run their own instance.
4. **For every learner.** Free, fast on a phone and a slow connection, and available in the
   languages students study in.
5. **Architecture before breadth.** Build the mechanisms (pipeline, review, dedupe, provenance)
   once and well, then add sources incrementally.
6. **Respect for sources.** We use official and permitted sources, ask for permission where it's
   needed ([register](sources/permissions.md)), attribute properly, and never use certification
   dump sites ([not onboarded](sources/not-onboarded.md)).

---

## Goal 1 · Every past question, in one place

**Status: now.**

- **Every exam type:** certifications, government recruitment, competitive entrance exams and
  university exams.
- **Multiple sources per exam:** official papers and keys, plus permitted third-party and open
  datasets, merged without duplicates ([ADR-014](adr/014-multi-source-provenance.md)).
- **Browsable by each exam's own hierarchy** (exam → paper → year → sitting, or university →
  course → semester) and **searchable across all of them**
  ([ADR-013](adr/013-knowledge-index-hierarchy.md)).
- **Real papers, represented faithfully:** sections, marks, negative marks, numeric-range answers,
  cancelled or marks-to-all questions, and answer-key revisions.

How it works today: connectors collect questions from a source, an admin reviews each batch, and
the pipeline validates it, detects duplicates across all sources (so re-collecting a source only
adds what's new) and publishes it with its provenance. The website serves it for browsing, search
and practice.

**Done**
- Multi-exam-type catalogue, review queue with quality checks, cross-source deduplication and
  idempotent publishing.
- Connectors: Microsoft Learn practice assessments and Markdown question sets.
- One permanent URL per question (`/questions/{slug}`), listing every paper it appeared in.
- Shared PDF stages: positioned text, question segmentation and answer-key tables.
- Practice: Learn and Simulation modes, multi-answer and image questions, search.
- Source research dossiers for every planned source ([docs/sources](sources/README.md)).

**Near-term milestones**, in order ([specs](specs/README.md)): marks, sections and numeric answers →
image storage → **GATE CS pilot** → exam hierarchies → Kerala PSC, ISTQB/AWS, and Kerala
universities.

---

## Goal 2 · Global scale

**Status: growing.** The foundations are being built; nothing here is at global scale yet.

- **Countries and languages:** language and region become first-class fields, and translations of
  the same question are linked (for example a paper's English, Malayalam and Hindi editions), so
  search can show one result per question.
- **Scale target:** tens of millions of questions from thousands of exam bodies worldwide.
- **Infrastructure that grows in stages**, each step taken when measurements say it's needed, not
  before:
  1. edge caching and object storage (Cloudflare Pages and R2);
  2. a dedicated search engine behind the existing search interface, and read replicas, once
     PostgreSQL search stops meeting its targets (around 2M questions or p95 above 300 ms; see the
     [knowledge-index plan](architecture/knowledge-index.md));
  3. an analytics/ML platform (warehouse or lakehouse) only when data volume demands it.
- **Ingestion at scale:** orchestrated, parallel, idempotent pipelines
  ([ADR-012](adr/012-job-queue-deferral.md) records when a job queue becomes worth it), with OCR and
  transcription for scanned and image-based papers.

---

## Goal 3 · A knowledge system anyone can query

**Status: next.**

Ask in plain language and get answers grounded in real exam questions and explanations, with
citations back to the papers they came from:

- *"How is the bending moment of a simply supported beam calculated?"*
- *"Which topics has GATE CS asked about every year since 2015?"*
- *"Show me questions like this one from other exams."*

**Approach**
- **Embedding as a pipeline stage** — each published question (with its explanation) becomes one
  chunk, carrying the same provenance and version stamps as the question itself
  ([roadmap item 30](roadmap/engineering-roadmap.md)). `pgvector` in the existing PostgreSQL; no new
  infrastructure to start.
- **Retrieval reads only published, reviewed content** — never the review queue, never the live web.
- **Every answer cites its sources**; if the collection doesn't contain an answer, say so.
- **An evaluation set** of questions with known good answers, run in CI, so quality is measured
  rather than guessed.

**Open questions for contributors:** embedding model choice (quality vs cost vs multilingual
support), answer generation vs retrieval-only as a first version, and how to present citations on a
phone screen.

---

## Goal 4 · Question prediction

**Status: planned.**

For an upcoming exam — say NEET next year — Prepora studies every previous paper and generates a
**predicted question paper** for students to practise with.

**How a predicted paper is built**
1. **Learn the exam's pattern over the years** — how many questions each topic gets, how that has
   shifted, difficulty mix, question styles (single answer, multiple answer, assertion–reason,
   numerical), and syllabus changes.
2. **Forecast the blueprint** for the next paper — expected weight per topic and difficulty, with a
   confidence level for each.
3. **Assemble the paper** to that blueprint.
   - *First version:* choose the most representative real past questions for each forecast topic
     and style — every question is real, reviewed and cited.
   - *Later:* add newly generated questions in the same style, clearly marked as generated and
     reviewed before publishing.
4. **Show the reasoning** — each section of a predicted paper links to the trend it came from
   ("Thermodynamics: 6–8 questions expected, up from an average of 5").

**How we keep it trustworthy**
- **Backtesting** — predict each past year using only the papers before it (predict 2024 from
  2010–2023), compare against the real paper, and publish the results: how well the forecast topic
  weights matched, and how many predicted topics actually appeared.
- **Clear labelling** — a predicted paper is always presented as practice built from trends, never
  as a leak or a guarantee.
- **Enough data first** — an exam gets predictions only once it has enough consistently tagged past
  papers for the backtest to be meaningful.

**Open questions for contributors:** the forecasting model (from simple weighted trends up to
time-series and ML models), the minimum number of years per exam, how to handle syllabus changes,
and how to measure "a good predicted paper".

---

## Goal 5 · Trust and community

**Status: ongoing.**

- Every answer shows its provenance. When sources disagree, the disagreement goes to a person to
  resolve, never to whichever source was collected last.
- Community contributions (the Contribute flow) and "report an error in this question".
- AI assistance stays optional and labelled, and a person confirms it before anything is published.

---

## How we work

- **Build from written specs, in order:** one issue → one branch → one reviewed PR
  ([working agreements](../CLAUDE.md)).
- **Research a source first:** legitimacy, licence, format and answer quality, before writing a
  connector ([playbook](sources/README.md)).
- **Big features start as RFCs** in [GitHub Discussions](https://github.com/aswinakofficial/prepora/discussions),
  so the design is agreed before code is written. Anyone can propose one.
- **Architecture decisions are recorded as ADRs** in [docs/adr](adr/).

## How you can help

| Area | Good ways to start |
|---|---|
| Sources | Research an exam source, write a connector, contribute a past paper. |
| Platform | Pipeline stages, search, the review queue, performance. |
| Knowledge system | Embeddings, evaluation sets, the "Ask" interface. |
| Prediction | Topic tagging, the backtesting harness, forecasting models. |
| Everywhere | Design, accessibility, translations, docs, testing. |

See [CONTRIBUTING.md](../CONTRIBUTING.md) to set up a local copy in about ten minutes.
