# ADR-014: Multiple sources per question, and answers with provenance

- **Status:** Accepted
- **Date:** 2026-10-01
- **Design:** [docs/architecture/knowledge-index.md §4](../architecture/knowledge-index.md#4-sources-and-answers-with-provenance)

## Context

The same exam is available from several places:
- the official body;
- coaching institutes and portals;
- community sites;
- open datasets.

The shared dedupe layer ([dedupe.md](../architecture/dedupe.md)) already merges the same question
coming from different sources into one. But nothing records *which* sources carried it. Answers are
stored flat, with no record of where they came from, and `questions.source_label` was never used.

The source research ([docs/sources](../sources/README.md)) found:
- **Official answers come in grades:** final, provisional, revised, examiners' schemes of
  valuation, and vendors' sample keys.
- **Some sources have no official answer at all:** GATE 2019–20 and university papers.
- **Third-party answers are useful for cross-checking:** EasyPSC matched the Kerala PSC final key
  on 97 of 97 questions.
- **Most third-party sources reserve all rights,** and some datasets claim open licences over
  content their uploader doesn't own.

## Decision

1. **Attestations.**
   - `question_sources` records every time a source carried a question: source, URL, the source's
     own ID, the answer it gave, and a **licence status**.
   - Licence status is one of `official_public | permission_granted | open_licence |
     reference_only | unknown | disallowed`.
   - Publishing writes one row for every outcome that links a source's question to a published
     question.
2. **Answer claims.**
   - Every answer asserted by a source, a reviewer or the AI step is an `answer_claims` row with a
     provenance and a status.
   - A resolver picks the accepted claim with the highest precedence:
     1. official revised
     2. official final
     3. official scheme of valuation
     4. official sample key
     5. reviewer
     6. AI-suggested and confirmed
     7. third-party consensus (2 or more agreeing sources)
     8. official provisional
     9. third-party single
     10. community
   - The resolver writes `question_answers`, which records the winning provenance.
3. **Licence rule.**
   - Content from a source marked `reference_only` or `disallowed` may be used to **cross-check**
     answers and counts, but is **never displayed**: not its text, explanations, tags or images.
   - Explanations from a third party are shown only with that source's permission
     ([permissions](../sources/permissions.md)).
4. **Conflicts.** When accepted claims disagree, the question goes to an admin conflict queue
   rather than being resolved silently.
5. **Visible provenance.** Question pages show where the answer came from ("Official final key",
   "AI-suggested, reviewed", "Unverified: one third-party source") and how many sources carried the
   question.

## Consequences

- **Trust is explicit and auditable.** A provisional key can be replaced by the final one
  automatically, and a disagreement surfaces instead of disappearing.
- **The policy moves into data.** "Never invented" becomes "never published without an official key
  or a person's confirmation, always labelled" (`docs/vision.md`), enforced by provenance rather than
  by rejecting every question without an official answer.
- **Moderation work increases.** Only official or consensus claims resolve automatically.
- **Back-fill.** Existing MS Learn questions each get one attestation and one `official_sample_key`
  claim.

## Amendment (2026-10-04): completing a paper from several sources

Decided by the owner while planning "Finish GATE" ([Spec 8](../specs/08-paper-editions.md)).

- **Papers are assembled field by field.** Each question's text, options, figure, answer and
  explanation come from the best source that has them. Every field records where it came from, so
  a source's gaps (a scanned paper, a missing key, a corrupt file) are filled from another source
  of the same paper.
- **Answers without an official key** are published automatically when **at least two independent
  non-official sources agree**. They're labelled "Answer from 2 independent sources, not an
  official key". One source, or sources that disagree, means the review queue. An official key
  always wins when one exists, and a disagreement with it is logged.
- **The licence rule is unchanged.** A `reference_only` source can confirm an answer and count
  towards agreement, but its text and explanations are never displayed.
