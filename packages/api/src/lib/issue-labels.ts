// What each intake issue code means, for people (docs/specs/07-intake.md). Mirrors
// apps/pipeline/prepora_pipeline/core/quality.py's ISSUE_CODES. Imports nothing, so the admin
// "Held questions" page reaches it through "@prepora/api/src/shared".
export const ISSUE_LABELS: Record<string, string> = {
  figure: "Figure or image",
  math: "Math that didn't extract cleanly",
  layout: "Table or side-by-side layout",
  image_option: "An option that is only an image",
  type_mismatch: "Question type disagrees with the answer key",
  invalid: "Failed validation",
};
