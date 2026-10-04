# Spec 9 · Fixing held questions (the remediation ladder)

**Status:** Superseded (2026-10-04). Split into [Spec 13](13-math-recovery.md) (math from the PDF), [Spec 14](14-figures.md) (figures) and [Spec 15](15-ai-transcription.md) (AI transcription), with the "a better edition" step in [Spec 8](08-paper-editions.md).
**Depends on:** Specs 7 and 8; Spec 4's R2 setup for crops
**Design:** [knowledge-index §4a](../architecture/knowledge-index.md)

## Scope (to be detailed)
Each held intake item takes the cheapest fix that clears its issues. Each fix is recorded as a
`question_revisions` row, with origin `source | ocr | ai_transcribed | reviewer_edited`, and a
resolver writes the chosen revision to `questions`.
1. **A better edition:** another source's clean text for the same paper and number.
2. **Crop:** the text plus a page crop, served from R2.
3. **OCR** (Tesseract) for scans. For GATE CS that's 2007–2010, 2019 and 2021.
4. **AI transcription** of the crop (Claude vision) into text and LaTeX. It **always needs a
   reviewer's confirmation** ([ADR-015](../adr/015-ai-assistance.md)), because a transcription can
   change the question.
5. **Reviewer edit** in the review UI.

The intake status gains `fixing`.
