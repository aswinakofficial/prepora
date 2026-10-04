# Spec 8 · Paper assembly: completing one paper from several sources

**Status:** Draft. It's written in full when Spec 13 is merged.
**Milestone:** Finish GATE
**Depends on:** Spec 7 (intake), Spec 13
**Design:** [knowledge-index §4](../architecture/knowledge-index.md) (attestations and answer
claims) and §4a (editions); [ADR-014](../adr/014-multi-source-provenance.md), including the
2026-10-04 amendment on agreeing sources.

## Context

One exam paper exists in several places, and each copy is incomplete in its own way. Take GATE CS:
- **2020:** the official paper is a scan, and GATE published **no key** for 2019 or 2020.
- **The Drive archive:** two corrupt files (2011, CS-1 2017).
- **2014, 2016 and 2018:** the key is printed inside the paper.
- **Third-party sites:** clean text, plus answers, for papers the official sites lost.

The question and its answer are the same everywhere. So instead of choosing one source per paper,
a paper is **assembled field by field**: each question's text, options, figure, answer and
explanation come from the best source that has them. Every field says where it came from, and
gaps are filled from other sources within each source's licence.

## Owner decisions (2026-10-04)
- **Merge, don't just pick.** A source missing a question, a key or a clean copy is completed from
  another source of the same paper.
- **Answers without an official key:** published automatically when **at least two independent
  non-official sources agree**. It's labelled "Answer from 2 independent sources, not an official
  key". A single source, or sources that disagree, goes to the review queue. An official key always
  wins when one exists.

## Deliverable and UI acceptance
| # | Step | Expected |
|---|---|---|
| 1 | Import GATE CS 2022, 2023 and 2024 (official site) and 2014, 2016 and 2018 (Drive) | Admin → Held questions lists every paper, with its editions |
| 2 | Open a paper's assembly report (Admin → Held questions → the paper) | For each question, which source gave its text, figure and answer, and what's still missing |
| 3 | Open a question that appears in two sources | The question page says "Seen in 2 sources" |
| 4 | A paper whose official copy is a scan but another source has clean text (allowed by licence) | The question shows the clean text, and says where the text came from |
| 5 | A question with no official key whose answer two independent sources agree on | It's published, labelled "Answer from 2 independent sources, not an official key" |
| 6 | A question whose only answer comes from one source, or whose sources disagree | It waits in the review queue, showing each source's answer; it isn't published |
| 7 | Open `docs/sources/reports/` in the repo | One committed report per paper (counts only), which CI compares on re-runs |

## Scope (to be detailed)
- **Paper identity across sources.** `paper_key` (Spec 7) is source-independent, so every edition
  of GATE 2020 CS is `gate/2020/cs/…`. Questions are matched by paper and number where the
  numbering agrees, and by content (the shared dedupe layer) where it doesn't (booklet orders, a
  missing question).
- **Field-level assembly.** For each question, each field is chosen from its candidates by
  precedence:
  - **Text and options:** the official clean text, then the official text rebuilt from the PDF
    (Spec 13), then another source's text if its licence allows display, then AI transcription
    (Spec 15).
  - **Figure:** the official page.
  - **Answer:** the resolver in knowledge-index §4 (official revised > final > … >
    `third_party_consensus` > …).
  - **Explanation:** the source's own if allowed, otherwise AI (Spec 11).

  The chosen source is recorded per field (`question_sources` and `answer_claims`, minimal
  versions).
- **Licence rule (ADR-014):** a `reference_only` source, such as GATE Overflow (all rights
  reserved), can **confirm** an answer and count towards agreement. Its text and explanations are
  never displayed.
- **Independence:** two sources only count as independent if neither copies the other (a mirror
  doesn't count), recorded per source in its dossier.
- **Conflicts:** official vs anything else, the official answer wins, and the disagreement is logged
  for review. Non-official sources that disagree go to the review queue.
- **Sources for the GATE track:** the IITG archive and the Drive folder now. Third-party answer
  sources (GATE Overflow and others) only after their dossier and permission entry say they may be
  used (`docs/sources/permissions.md`).
