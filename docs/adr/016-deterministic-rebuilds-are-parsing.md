# ADR-016: Rebuilding text from the source's own PDF is parsing, not a revision

- **Status:** Accepted, with [Spec 13](../specs/13-math-recovery.md) (the owner approved it on
  2026-10-16). Knowledge-index §4a is amended as proposed below.
- **Date:** 2026-10-16
- **Design:** [docs/architecture/knowledge-index.md §4a](../architecture/knowledge-index.md#4a-intake-revisions-and-explanations-quality-as-data),
  rules 1–3 and the remediation ladder

## Context

Knowledge-index §4a lists a remediation ladder for held questions (a better edition, a page crop,
math rebuilt from glyph positions, AI transcription, a reviewer edit) and says "each fix is a
revision, and a resolver writes the chosen one to `questions`". Revisions
(`question_revisions`, with an `origin`) arrive with Spec 15, for AI transcription.

Spec 13 rebuilds GATE math from the official PDF's own glyph positions, deterministically and with
no AI, and re-typesets every question, clean ones included. It needs to decide whether that output
is a revision, with an origin and a label, or simply a better parse. Spec 8's field precedence
("the official clean text, then the official text rebuilt from the PDF (Spec 13), then …") assumes
the two are separate candidates. Spec 14 (figures cut out of the page) faces the same question.

## Decision

1. **A deterministic transform of one source document's own content is parsing.** That covers math
   rebuilt from glyph positions, and anything else computed only from the same document's glyphs,
   fonts and drawings, with nothing added.
   - It's recorded by the intake item's `parser_version`, not by a `question_revisions` row.
   - It re-processes the intake item in place, keyed by the content hash (rule 3). It never creates
     a second candidate for the same field.
   - It carries no public label and no review badge. Extracted text never has, and this is
     extraction too.
2. **Revisions are for content from another origin:** OCR, AI transcription, a reviewer's edit.
   Another edition of the same paper is an attestation and a field candidate (Spec 8, ADR-014),
   not a revision of this one.
3. **All or nothing per question.** A rebuild either explains every part of a question it touches,
   or the question keeps its previous extraction unchanged. A held question stays held, with a named
   reason; a clean one stays as it was. Nothing partly rebuilt is certified.
4. **A rebuild emits only a closed vocabulary.** Whatever markup it produces (LaTeX for math) comes
   from a committed table that's tested against the site's renderer, so it can't produce a render
   error.
5. **Changed text still goes through review.** When a better parser changes a question that is
   already published, intake's content hash sends it back to review (Spec 7). Approving it as "same
   question, use the new wording" keeps the old wording as a variant, so nothing is lost.

## Consequences

- **Spec 8's text precedence has one official tier.** "Official extracted text, rebuilt or not"
  comes first, then another source's text if its licence allows display, then AI transcription.
  Spec 8 should say so when it's written in full.
- **Spec 14** can treat figures cut from the official page the same way: parsing, versioned by
  `parser_version`.
- **Spec 15** transcribes only what's still held. Its "every word and number the PDF contains"
  check compares against the PDF's own extracted text, which is what a still-held question keeps.
- **What the rebuild did to a question isn't stored per field.** Only `parser_version` and the
  committed counts-only report record it. Showing a clean question's "kept as is" reason in the
  admin needs a non-blocking intake note, which is a later migration.

### Proposed change to knowledge-index §4a

Replace the ladder's closing line, "Each fix is a revision, and a resolver writes the chosen one to
`questions`", with:

> A fix that adds content from another origin (OCR, AI, a reviewer) is a revision, and a resolver
> writes the chosen one to `questions`. A better parse of the same document (math rebuilt from glyph
> positions, a page crop) isn't a revision: it re-processes the intake item in place, under a new
> `parser_version` (rule 3, [ADR-016](../adr/016-deterministic-rebuilds-are-parsing.md)).
