# Prepora — Vision and roadmap

> **Every past exam question in one place — searchable, explained, and used to predict what comes
> next.**

Previous-year questions are the most reliable way to prepare for an exam, and the hardest thing to
find: scattered across PDFs, forums and paywalled sites, rarely with trustworthy answers, almost
never with explanations. Prepora's goal is to make them **open, organised and useful** for every
learner — and then to go beyond a question bank: a knowledge system you can ask questions of, and
predicted papers that help you prepare for the exam that's coming, not only the ones already past.

This page is the "why" and the "where next". For the day-to-day engineering plan see
[docs/roadmap/engineering-roadmap.md](roadmap/engineering-roadmap.md); to get involved see
[CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Principles

These decide the hard trade-offs. A change that breaks one of them needs a very good reason.

1. **Sourced, reviewed, always labelled.** Every published question traces back to where it came
   from, and a person approves every batch before it goes live. Nothing is published without an
   official answer or a person's confirmation, and every answer says where it came from. Where an
   official answer doesn't exist, an optional AI step may *suggest* one, but it's published only
   after a reviewer confirms it, and it stays labelled "AI-suggested, reviewed"
   ([ADR-015](adr/015-ai-assistance.md)). Missing data is never filled in silently.
2. **Honest about uncertainty.** Predictions are labelled as predictions, show what they were built
   from, and publish how accurate the method has been on real past papers.
3. **Open.** The code is MIT-licensed and built in public. The repository holds code only — no
   scraped content — so anyone can run their own instance.
4. **For every learner.** Free to use, fast on a phone and a slow connection, and — over time —
   available in the languages students actually study in.
5. **Architecture before breadth.** Build the mechanisms (pipeline, review, dedupe, provenance) well
   once, then add exams and sources incrementally on top of them.

---

## Pillar 1 · Every past question, in one place

**Status: available now, growing.**

How it works today: scrapers and connectors collect questions from a source → an admin reviews each
batch in the review queue → the pipeline validates it, detects duplicates across all sources (so
re-collecting a source only adds what's new), and publishes it with its provenance → the website
serves it for browsing, search and practice.

**Done**
- Multi-exam-type catalogue: certification, government, competitive and university exams.
- Review queue with quality checks and "new vs already published" counts per batch.
- Deduplication across sources and re-scrapes; idempotent publishing.
- Connectors: Microsoft Learn practice assessments, IndiaBix, and Markdown question sets.
- Practice: Learn and Simulation modes, multi-answer and image questions, search.

**Next**
- More sources — Kerala PSC, GATE, SSC, UPSC, NEET and university papers — each as a connector
  ([guide](connectors/README.md)).
- Community question submissions (the Contribute flow) and "report an error in this question".
- Consistent topic and difficulty tagging across exams — the foundation the other two pillars stand
  on.
- Hosted pipeline and object storage (Cloudflare R2) for question images, so collection doesn't
  depend on one laptop.

---

## Pillar 2 · A knowledge system anyone can query

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

## Pillar 3 · Question prediction

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

## How big decisions are made

- **Ideas and questions** — [GitHub Discussions](https://github.com/aswinakofficial/prepora/discussions).
- **RFCs for large features** — the knowledge system and prediction start as an RFC discussion, so
  the design is agreed before code is written. Anyone can propose one.
- **Architecture decisions** are recorded in [docs/adr](adr/).

## How you can help, by pillar

| Pillar | Good ways to start |
|---|---|
| 1 · One place | Write a connector for an exam source; add a past paper in Markdown; improve the review queue; report wrong answers. |
| 2 · Knowledge system | Join the RFC; build the embedding stage; assemble the evaluation set; design the "Ask" interface. |
| 3 · Prediction | Join the RFC; improve topic tagging; build the backtesting harness; prototype a forecasting model on one exam. |
| Everywhere | Docs, design, accessibility, translations, testing. |

See [CONTRIBUTING.md](../CONTRIBUTING.md) to set up a local copy in about ten minutes.
