import type { SourceQualityChecks } from "../review-quality.js";

// GATE's part of the review queue's quality checks (lib/review-quality.ts). GATE batches come from
// the pipeline's connector (apps/pipeline/prepora_pipeline/connectors/gate) as complete questions,
// so the one thing worth a reviewer's eye is a question that lost its marks: every GATE question
// carries 1 or 2 from the official key.

const GATE_HOSTS = new Set(["gate2026.iitg.ac.in"]);

export const gateQualityChecks: SourceQualityChecks = {
  source: "gate",
  appliesTo: (sourceUrl) => {
    try {
      return GATE_HOSTS.has(new URL(sourceUrl).hostname);
    } catch {
      return false;
    }
  },
  checks: [
    {
      code: "missing_marks",
      test: (el) => el.normalized?.marks == null,
      what: "have no marks",
    },
  ],
};
