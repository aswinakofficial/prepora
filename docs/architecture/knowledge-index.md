# The knowledge index

Prepora indexes past exam questions across four kinds of exams: **certification, government,
competitive and university**. Each kind has a different natural hierarchy. Every one must be
**browsable by its own hierarchy** (priority 1) and **searchable across all of them** (priority 2).
Browsing by subject or topic follows from a shared taxonomy.

Each exam can also have **several sources**: official ones, third-party sites and open datasets.
The shared dedupe layer ([dedupe.md](dedupe.md)) merges the same question from different sources
into one, and every answer keeps a record of where it came from.

This document is the target design. It supersedes §7 (question sets), §12 (taxonomy) and §15
(URLs) of [exam-domain-model.md](exam-domain-model.md), which remains the background for the
organization/exam split. The decisions behind it are recorded in:
- [ADR-013](../adr/013-knowledge-index-hierarchy.md) (hierarchy);
- [ADR-014](../adr/014-multi-source-provenance.md) (sources and answers);
- [ADR-015](../adr/015-ai-assistance.md) (AI).

The research on each source is in [docs/sources](../sources/README.md).

## 1. The natural hierarchies

| Kind | Hierarchy | Example |
|---|---|---|
| Certification | vendor → track/level → exam code → version | AWS → Associate → SAA-C03 → C03; ISTQB → Foundation → CTFL → v4.0.1 |
| Competitive | body → exam → paper/discipline → year → sitting/shift | GATE → CS → 2026 → CS-1; NTA → JEE Main → Paper 1 → 2026 → April → 2 Apr shift 1 |
| Government | commission → post family/common exam → department → year → paper code → language edition | Kerala PSC → Tradesman → Masonry → 2026 → 087/2026; 088/2026 -M/-T/-K |
| University | university → programme → regulation → branch → semester → course → session → paper | KTU → B.Tech → 2019 → CSE → S6 → CST302 → Dec 2024 |

## 2. Hierarchy model: relational ends, typed tree in the middle

The ends stay relational: organizations, exam types, exams and question sets keep their foreign
keys, which publishing and the API rely on. **The levels between an exam and its papers form a
typed tree per exam**, whose shape is defined by a template for that kind of exam.

```
hierarchy_templates  { slug, examTypeId, label }                 e.g. gate-paper, ktu-btech, cert-versioned
hierarchy_levels     { templateId, depth, key, label,
                       valueKind (slug|year|code|date),
                       inUrl, isFacet, required }                e.g. paper(1) → year(2) → sitting(3)
exams                + hierarchyTemplateId, + groupId → exam_groups
exam_groups          { organizationId, slug, label, kind }       AWS → Associate; ISTQB → Foundation
catalog_nodes        { examId, parentId, levelId, slug, label, code,
                       year, startsOn, endsOn, attributes jsonb,
                       courseId?, path, ancestorIds[], sortKey, status }
question_set_placements { questionSetId, nodeId, isPrimary }     one paper in several places
courses              { organizationId, code, title, credits, category, subjectId }   shared catalogue
```

- **Integrity.** A trigger checks that every node's level is one deeper than its parent's, within
  the exam's template, and maintains `path` (only the levels shown in URLs) and `ancestorIds`.
  Uniqueness: `(examId, path)` and `(parentId, slug)`.
- **Query simplicity.** Breadcrumbs are one `WHERE id = ANY(ancestorIds)` query. "Everything under
  a node" is a GIN lookup on `ancestorIds`. No recursive queries are needed.
- **Hidden levels.** A level can be structural without appearing in URLs (`inUrl = false`), for
  example a certification's single "Version 1".
- **Shared content.** A common course examined for many branches, or one paper used by many posts,
  is placed in several nodes (`question_set_placements`). It isn't copied.
- **`attributes`** (credits, course category, attempt type, admission years, the organising
  institute) are validated per level by a zod schema in `packages/content`. Anything that becomes
  a filter is promoted to a column or a facet.

Templates in use:

| Template | Levels (URL levels in **bold**) |
|---|---|
| `cert-simple` | version (hidden) |
| `cert-versioned` | **version** |
| `gate-paper` | **paper** → **year** → **sitting** (optional) |
| `jee-main` | **paper** → **year** → **session** → **shift** |
| `upsc-prelims` | **paper** → **year** |
| `kpsc` | **department** (optional) → **year** |
| `university` | **regulation** → **branch** → **semester** → **course** → **session** |

## 3. Papers, editions, sections and occurrences

```
paper_groups       { nodeId, qpCode, title, heldOn, paperKind, durationMin, totalMarks,
                     keyStatus, keyPublishedAt, sourceDocumentUrl, attributes }
paper_group_codes  { paperGroupId, kind (psc_category|booklet_code|subject_code), code, label }
question_sets      + paperGroupId, language, bookletSeries, isReferenceEdition, paperKind
paper_sections     { paperGroupId, key, title, position, subjectId, numberFrom, numberTo,
                     defaultMarks, defaultNegative, isOptional, optionalGroup, choiceRule jsonb }
question_occurrences + sectionId, numberLabel, choiceGroup, marks, negativeMarks,
                       answerStatus, externalRef, attributes {module, co, bloom, optionIdMap}
```

- **`paper_kind`** records what a paper is: `past_paper | model_paper | sample_paper |
  official_practice | mock | memory_based | question_bank`. Pages and search show it, so a
  vendor's sample, a university's model paper and a real past paper are never confused.
- **`key_status`**: `none | provisional | final | revised`. Publishing replaces a provisional key
  with the final one.
- **A question set is one edition of a paper:** one language and one booklet series. Kerala PSC's
  -M/-T/-K are three editions of one paper group. UPSC's bilingual booklet becomes an English and
  a Hindi edition. Booklet series A is the reference edition.
- **Choice rules:** `{kind:'all'}`, `{kind:'any_n', n}`, `{kind:'one_per_group'}` (one question per
  module, OR-pairs), and `{kind:'pick_sections', n, from}` (GATE XE/XL optional sections, under one
  global numbering).
- **`answer_status`** lives on the occurrence, because it's a decision about one paper: `scored |
  marks_to_all | dropped | cancelled | bonus | under_review`.
- **Sub-parts and shared passages.** A `composite` question type, plus `questions.parentQuestionId`
  and `partLabel`. Parts are real questions, so dedupe, answers and search all work on each part.

**Languages:** `questions.language` (BCP 47), plus `question_translation_groups`. Publishing a
non-reference edition links each of its questions to the reference edition's question with the
same series-A number. Cross-language matching by meaning comes later, with embeddings.

**Taxonomy:**
- `subjects` and `topics` stay universal; `topics.code` is added.
- `syllabus_items` holds each exam's or node's domains, objectives, learning objectives, modules
  and course outcomes. Each has a code (`FL-1.2.3`, `CO3`), a cognitive or Bloom level, a weight,
  and a link to a universal topic.
- `question_topics` gives a question several topics, recording who tagged each one and whether it
  was confirmed.

## 4. Sources and answers with provenance

([ADR-014](../adr/014-multi-source-provenance.md))

```
question_sources  { questionId, occurrenceId?, sourceId, scrapedQuestionId?, rawArtifactSha256,
                    sourceUrl, externalRef, sourceNumberLabel, observedText?,
                    licenceStatus, licenceNote, rawAnswer, firstSeenAt, lastSeenAt }
answer_claims     { questionId, occurrenceId?, attestationId?, provenance, payload, payloadHash,
                    status (pending|accepted|rejected|superseded), confidence?, aiModel?,
                    aiPromptVersion?, createdBy, confirmedBy, confirmedAt, note }
question_answers  + provenance, claimId, numericMin, numericMax, rangeGroup
```

- **Attestations.** Publishing writes a `question_sources` row for every outcome that links a
  source's question to a published one (new, exact match in or across sets, a reviewer's "same").
  So a question page can say "seen in 4 sources".
- **`licenceStatus`:** `official_public | permission_granted | open_licence | reference_only |
  unknown | disallowed`.
  - Content from a `reference_only` or `disallowed` source may support cross-checks, but is
    **never displayed**.
  - Licence status is set from the source's dossier and [permissions](../sources/permissions.md).
- **Claims and the resolver.** Every answer a source or person asserts is a claim. The resolver
  (`packages/api/src/lib/answers.ts`, mirrored in the pipeline) picks the accepted claim with the
  highest precedence:
  1. `official_revised`
  2. `official_final`
  3. `official_scheme_of_valuation`
  4. `official_sample_key`
  5. `reviewer`
  6. `ai_suggested_confirmed`
  7. `third_party_consensus` (2 or more agreeing sources)
  8. `official_provisional`
  9. `third_party_single`
  10. `community`

  It then rewrites `question_answers`.
- **Conflicts.** When accepted claims disagree, the question goes to an admin conflict queue, the
  same pattern as possible duplicates.
- **Numeric ranges.** GATE's "X to Y OR X to Y" becomes two `question_answers` rows with
  `numericMin`/`numericMax`.
- **Deprecated.** `questions.source_label` (`ai_source`) is replaced by these explicit fields.

## 5. URLs and navigation

```
/exams                                       kinds of exam (tabs from exam_types)
/exams/{exam}                                exam hub: first-level children, latest papers
/exams/{exam}/{…node path}                   any node: children, papers, facets
/exams/{exam}/{…node path}/{paper}           a paper: sections, numbering
/exams/{exam}/{…node path}/{paper}/q/{n}     a question in its paper (prev/next)
/questions/{slug}                            CANONICAL question page (lists every paper it appeared in)
/bodies/{org}[/{group}]                      organization hub (AWS → Associate)
/subjects/{s}, /topics/{s}/{t}               taxonomy browsing
```

Examples:
- `/exams/gate/cs/2026/cs-1`
- `/exams/jee-main/paper-1/2026/apr/2026-04-02-s1`
- `/exams/ktu-btech/2019/cse/s6/cst302/2024-dec`
- `/exams/kpsc-tenth-level-prelims/2026/088-2026-ml`
- `/exams/aws-saa/c03`
- `/bodies/aws/associate`

- **Routing.** A splat route `exams/$examSlug/$.tsx` resolves `(examId, path)` to a node. If that
  fails, it drops the last segment and resolves the paper by `(nodeId, slug)`.
- **Canonical questions.** `/questions/{slug}`: `questions.slug` is already unique and never
  changes after publishing (it's the stable ID, lowercased), so the `publicId` column first proposed
  here isn't needed ([Spec 1](../specs/01-question-urls.md)). Question pages are canonical and
  don't depend on the hierarchy, so a question keeps its URL when nodes move or duplicates merge.
  In-paper views set `rel=canonical` to the question page.
- **Old URLs.** `/questions/{exam}/{variant}/{year}/{subject}/{slug}`, `/question-sets/{slug}` and
  `/exams/{exam}/subjects/{s}` 301 to the new pages, through the existing `redirects` table. When a
  node's path changes, a redirect is written automatically.

## 6. Search

`question_search_docs` holds one row per question, maintained in the publish transaction and by a
reindex job:

```
questionId, slug, language, questionType, status,
examTypeSlugs[], orgSlugs[], examSlugs[], nodeIds[], levelValues[],   -- "gate:paper:cs", "*:year:2026"
years[], subjectIds[], topicIds[], syllabusCodes[], paperKinds[],
answerProvenance, hasAnswer, hasExplanation, sourceCount,
tsv tsvector, textNorm (normalize.py v2, for trigram)
```

- **Facets come from templates.** Every level marked `isFacet` becomes a facet automatically. Its
  counts come from `unnest(levelValues)` in one query, run alongside the hits query.
- **Browsing a hierarchy** uses the catalog tables directly. The search table serves text search
  and cross-type facets.
- **Multilingual.** The `tsv` uses English stemming for `en` and the `simple` configuration for
  Malayalam, Hindi and other Indic languages, and Indic queries add trigram matching on `textNorm`.
  Results collapse by translation group ("also in English"). Transliterated and cross-language
  matching wait for the embeddings phase (pgvector).
- **Interface.** `SearchProvider` gains `searchQuestions(query, {filters, facets, cursor})`. Move
  to Typesense or Meilisearch behind it only past about 2M documents, p95 above 300 ms, or a real
  need for typo tolerance.

## 7. AI assistance

([ADR-015](../adr/015-ai-assistance.md))

AI assistance runs only when `ANTHROPIC_API_KEY` is set, in the local pipeline. It produces:
- `ai_suggested` answer claims;
- `ai_transcribed` question text (`questions.textSource`: `source | ocr | ai_transcribed |
  ai_transcribed_confirmed`);
- AI topic tags.

Nothing reaches the published site until an admin confirms it, and a badge stays on it afterwards.

## 8. Five real cases, mapped

**GATE CS-1 2026, Q1–10 and the key**
- exam `gate`, template `gate-paper`;
- nodes: paper `cs` → year `2026` → sitting `cs-1` (attributes: `{organisingInstitute: "IIT Guwahati"}`);
- paper group: qpCode `CS-1`, kind `past_paper`, keyStatus `final`;
- one edition: `en`, no series;
- sections: `GA` (Q1–10, General Aptitude) and `CS` (Q11–65), each with marks;
- Q1–5 occurrences: marks 1, negative ⅓;
- the key row `1 | 3 | MCQ | GA | B | 1` becomes an `official_final` claim (keys `[B]`);
- a numeric row `4.24 to 4.26` becomes a range claim;
- `MTA` becomes the occurrence's `answer_status = marks_to_all`.

**Gap:** shared General Aptitude questions across papers in the same session are only *merged* by
dedupe; there's no explicit "shared section" link.

**Kerala PSC 088/2026, three language versions**
- exam `kpsc-tenth-level-prelims`, nodes: year `2026`;
- paper group: qpCode `088/2026`, kind `past_paper`, keyStatus `final`, `paper_group_codes` = 8+
  category numbers (`psc_category`);
- three editions: `ml`, `ta`, `kn`, series A, and `ml` is the reference edition;
- questions linked by translation group by number;
- `X` in the key becomes `answer_status = cancelled`.

**Gap:** English text isn't published for this paper, so there's no `en` edition. Fine: the
reference edition is `ml`.

**MGU MG1MDCMAT100, November 2024**
- exam `mgu-ugp`, template `university`;
- nodes: regulation `2024` → branch (programme stream) → semester `s1` → course `mg1mdcmat100`
  (shared `courses` row, category MDC) → session `2024-nov` (attempt type regular);
- paper group: qpCode `24900176`, kind `past_paper`;
- section Part A: `{kind:'any_n', n:10}`, 2 marks each;
- occurrence attributes: `{bloom:'U', co:1}`;
- answers: AI-suggested claims, confirmed by an admin.

**Gap:** an MDC course is open to students of every programme. That's modelled with placements,
but "which programmes may take it" isn't modelled.

**ISTQB CTFL v4.0.1, Sample Exam A**
- exam `istqb-ctfl`, group Foundation, template `cert-versioned`, node version `v4-0`;
- paper group: qpCode `Sample Exam A v1.7`, kind `sample_paper`;
- the answer table becomes `official_sample_key` claims;
- each per-option rationale is stored with the explanation;
- LO `FL-1.1.1` and K1 go to `syllabus_items` (cognitiveLevel K1) → universal topic.

No gaps.

**An existing MS Learn exam (AZ-104)**
- exam `az-104`, template `cert-simple`, hidden node `version-1`;
- the existing question set gets a paper group of kind `official_practice` and keyStatus `final`;
- answers become `official_sample_key` claims.

**Gap:** none. Migration S1 creates these from today's variant `standard` and session "Version 1".

## Foundation steps

Each step ships on its own. **The order of work, and exactly how each step is built, are in
[docs/specs](../specs/README.md).** They were narrowed on 2026-10-02 for a single maintainer:
S0 → P → minimal S4 → image storage → GATE pilot → S1. S3 (beyond one answer-provenance column),
S5, S6, S7, O and the AI step are deferred until a track needs them. The table below lists every
step.

| Step | What | Unblocks |
|---|---|---|
| S0 | Remove the fabricated exam-page set; canonical `/questions/{slug}` route with 301s from old URLs | Stable URLs |
| S1 | Templates, levels, nodes, placements and exam groups; migrate MS Learn (`cert-simple`); splat route, breadcrumbs, exam pages that show their levels | ISTQB, AWS, HashiCorp, Databricks |
| S2 | Pipeline contract v2 (`hierarchy[]`, paper, section, number label, marks, external ID, answer status/provenance, ranges); stable ID v2 (existing IDs never rewritten) | Every new connector |
| S3 | `question_sources`, `answer_claims`, the resolver and conflict queue; back-fill MS Learn; the optional AI suggestion job and confirmation UI | Multiple sources; AI answers |
| S4 | Paper groups, codes, sections, occurrence fields, key-status lifecycle | GATE, JEE, NEET, UPSC |
| S5 | Language, translation groups, edition linking, per-language search configuration | Kerala PSC, UPSC Hindi |
| S6 | Shared courses, syllabus items, question topics, composite questions, choice rules, schemes of valuation | Universities |
| S7 | Search docs table and faceted `/search` (a hierarchy-facets version can follow S1) | Search everywhere |
| P | Shared PDF stages: layout/bbox text, segmentation, key tables, join and validation, page crops, garble detector | Every PDF source |
| O | OCR (Tesseract or Claude vision), Shree-Mal mapper, image→LaTeX transcription | Scans, Malayalam, JEE images |
| S8 | Drop `exam_variants`, `exam_sessions` and `source_label` once nothing reads them | — |

## Risks

- **Changing a template after data exists** means re-parenting nodes. Templates are versioned, the
  trigger blocks invalid shapes, and canonical question URLs don't depend on paths.
- **`attributes` sprawl.** Validate per level, and promote anything that becomes a filter.
- **Placements add a second path to a paper.** Listing queries must go through placements,
  centralised in `catalog-questions.ts`.
- **Answer conflicts** are moderation work. Only official or consensus claims resolve
  automatically, and third-party-only answers are shown as unverified.
- **Indic full-text search** is weak in core Postgres. Trigram matching is the baseline until
  embeddings.
- **Moving to canonical question URLs** needs 301s for every indexed legacy URL. Generate them
  before deploying.
