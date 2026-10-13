# Sources: research before you build

Prepora collects past exam questions from many places: official exam bodies, certification
vendors, universities, third-party sites and open datasets. Each one differs in how its exams are
organised, how it publishes them, whether answers exist, and whether its content may be
republished at all. A connector written before those questions are answered tends to scrape the
wrong thing, model it wrongly, or collect content Prepora can't use.

So every source starts with research, written down as a **dossier** in this directory. A connector
([docs/connectors](../connectors/README.md)) is only written once its dossier says "go".

How the knowledge index fits all these sources together (hierarchies, papers, multiple sources,
answer provenance, search) is described in
[docs/architecture/knowledge-index.md](../architecture/knowledge-index.md).

## Dossiers

**Certifications** (vendors' own practice material only, never dump sites):

| Dossier | Verdict |
|---|---|
| [ms-learn](ms-learn.md) | Live |
| [istqb](istqb.md) | First certification track |
| [aws](aws.md) | Next |
| [hashicorp](hashicorp.md) | Next |
| [databricks](databricks.md) | Next |
| [certifications-other](certifications-other.md) | Mostly topic structure only. Covers CompTIA, ISC2, EC-Council, PMI, Scrum, PeopleCert, Google Cloud, Oracle, CNCF, Red Hat, Cisco, Confluent, Snowflake, Salesforce and Tableau |

**Competitive and government exams:**

| Dossier | Verdict |
|---|---|
| [gate](gate.md) | First exam-paper track |
| [kerala-psc](kerala-psc.md) | Recommended |
| [jee-main](jee-main.md) | Thin official coverage |
| [upsc-prelims](upsc-prelims.md) | Needs OCR |
| [neet-ug](neet-ug.md) | Parked |

**Universities (Kerala first):**

| Dossier | Verdict |
|---|---|
| [university-mgu](university-mgu.md) | Best university pilot |
| [university-calicut](university-calicut.md) | OCR |
| [university-ktu](university-ktu.md) | Access request needed |
| [university-kerala](university-kerala.md) | Small MCQ pilot |
| [university-cusat-kannur](university-cusat-kannur.md) | Deferred |

**Decisions and permissions:**

- [not-onboarded](not-onboarded.md): sources researched and deliberately not used.
- [permissions](permissions.md): the register of permission requests, with draft emails.

The research behind these dossiers was done on **2026-10-01** by reading the live sites, with
read-only requests and a handful per site. Anything that couldn't be confirmed is marked
**UNVERIFIED**. Sites change, so re-check before relying on a detail that's more than a few months
old.

## The research, in order

Answer these in order, and stop at the first "no". The [template](TEMPLATE.md) has a section for
each.

1. **Legitimacy.**
   - Who publishes it: the official exam body, a vendor, a university, a third party, or a dataset?
   - What do its terms, copyright notice, licence and robots.txt say? Quote them.
   - Separate the **question text** (usually the exam body's) from the **site's own work**
     (transcriptions, explanations, tags).
   - Note any bot walls (Cloudflare, Turnstile, lead forms). Prepora never bypasses them, and never
     submits personal data to get content.
   - If republishing needs permission, it goes in [permissions](permissions.md) before any
     publishing.
2. **Exam landscape, mapped onto our model.**
   - Which exams it covers, and their natural hierarchy: vendor → track → exam → version; body →
     exam → paper → year → sitting; university → programme → scheme → branch → semester → course →
     session.
   - Map it onto the [knowledge index](../architecture/knowledge-index.md) with two or three real
     examples.
   - List every case the model can't represent.
3. **How it publishes.**
   - Format: HTML, a JS app, a text PDF, a scanned PDF, or images inside a PDF.
   - How papers are found: listing pages, URL patterns, pagination.
   - How many years are reachable and rough volume.
   - Whether hosts move over time.
   - Check at least one real sample with `pdfinfo` / `pdftotext -layout`, and say whether its text
     is usable.
4. **Question shape.**
   - Question types (MCQ, multiple-select, numeric including ranges, descriptive, match, assertion-
     reason).
   - Images, equations and diagrams.
   - Sections, marks and negative marking.
   - Booklet series.
   - Languages and bilingual layouts.
5. **The answer ladder.** Which rungs exist, from best to worst:
   1. official final key;
   2. official provisional key;
   3. official scheme of valuation or sample key;
   4. answers in the source itself;
   5. third-party answers to cross-check against;
   6. no answer, so either an AI suggestion that an admin confirms or the question is held back.

   Also record how a key matches its paper (question number, booklet series, question ID), and how
   dropped or "marks to all" questions are shown.
6. **Third-party sources and datasets.** For every serious alternative to the official source:
   - coverage, format, answers and explanations;
   - its terms or licence;
   - its accuracy, spot-checked against an official key where possible.

   A dataset's licence only covers its uploader's own work: it can't re-license an exam body's
   questions. Watch for "memory-based" reconstructions and mislabelled mock tests.
7. **Fit with the vision.** Years available for trend analysis and prediction, and whether a
   syllabus or exam outline exists to tag topics against.
8. **Technical approach.**
   - Fetch method and rate limits.
   - Parsing (HTML, PDF layout, OCR or vision).
   - Identity (by position or by content) and the [dedupe profile](../architecture/dedupe.md).
   - Source-specific quality checks.
9. **Risks and open questions.**
10. **The source's own plan.** Phases, a pilot with acceptance criteria, and which knowledge-index
    foundation steps it depends on.

## Definition of done for an exam

Prepora takes **one exam at a time** to done, then starts the next (owner, 2026-10-04). MS Learn is
done; GATE is next ([specs](../specs/README.md)). Every exam's sources differ, so each gets its own
adapter. But the adapter is small, because the heavy lifting is shared:

- **Shared:** PDF and HTML stages, intake and quality, dedupe, publishing, rendering (Markdown and
  LaTeX), images, grading, and the review UI.
- **Per source:** a catalog of what to fetch, layout and key profiles measured on the real files,
  and a parser that turns them into NormalizedQuestions. Quirks live there, never in the shared
  stages.

An exam is **done** when all of these hold:

1. **Coverage:** every in-scope official paper is in the catalog, and each paper's answer key
   joins to its questions completely.
2. **Nothing is lost:** every question is either published or held with a reason (Admin → Held
   questions). Holds have been worked down with the fix ladder (a better edition, math rebuilt
   from the PDF, figures, AI transcription), and anything still held is listed with the reason in
   the dossier.
3. **It reads like the paper:** math, code, tables, figures and image options render correctly on
   the question page and in practice (checked by e2e tests and the owner).
4. **It grades like the exam:** single and multiple answers, numeric ranges, marks, negative marks,
   and marks-to-all or dropped questions.
5. **It's measured:** a per-paper quality report is committed, and re-importing is idempotent
   (nothing new, nothing duplicated).
6. **It's allowed and attributed:** the dossier's permission decision is recorded, and each page
   says where the question came from.
7. **It's explained:** the source's own explanations are used where it has them; otherwise AI
   explanations, when the global flag is on ([ADR-015](../adr/015-ai-assistance.md)).

## Ground rules that apply to every source

- **Never published without an official answer or a person's confirmation, and always labelled.**
  Where an answer came from is recorded on every answer (see
  [ADR-014](../adr/014-multi-source-provenance.md)).
- **Third-party content is used only as its licence or terms allow.**
  - A source we may only *reference* can be used to cross-check answers and counts, but its text
    and explanations are never shown.
  - Explanations are written by Prepora or contributors unless a source grants permission.
- **Certification exams use vendor-published practice material only.** Real exam questions are
  under candidate NDAs, and dump sites are never used.
- **Respect robots.txt and rate limits; never bypass bot protection.** The fetch layer
  (`core/http_client.py`) enforces the registry allowlist, robots.txt and per-source rate limits.
- **The repository holds no scraped content.** Samples stay local; test fixtures use real markup
  with invented content ([CONTRIBUTING](../../CONTRIBUTING.md#content-and-scraping-policy)).
- **AI assistance is optional and always confirmed by a person**
  ([ADR-015](../adr/015-ai-assistance.md)).
