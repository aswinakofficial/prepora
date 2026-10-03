# Spec 10 · Explanations: data model and display

**Status:** Draft. It's written in full when Spec 9 is merged.
**Depends on:** Spec 7
**Design:** [knowledge-index §4a](../architecture/knowledge-index.md), and
[ADR-015's amendment](../adr/015-ai-assistance.md)

## Scope (to be detailed)
- **New table `question_explanations`**: question, kind (`official | licensed_source | contributor
  | reviewer | ai_generated`), body, status (`pending | published | rejected | superseded`),
  `checks`, model, prompt version, created/confirmed by, `sampled_for_review`.
- **A resolver** sets `questions.explanation` and a new `questions.explanation_provenance`. Search
  keeps indexing `questions.explanation`.
- **Source first:** connectors keep extracting a source's own explanation wherever it has one, and
  it's stored as `official` or `licensed_source`.
- **Labels:** the question page and practice show the explanation's label, for example
  "AI-generated explanation · report an error". The "report an error" flow (#61) is pulled forward
  into this spec.
- **Back-fill:** MS Learn's existing explanations become `official`.
