import type { getDb } from "@prepora/db";
import { intakeItems } from "@prepora/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Intake (docs/specs/07-intake.md): every question a pipeline connector parses is stored as an
// intake item, `ready` or `held` with issue codes, before review. This keeps intake in step with
// the review queue, and powers the admin "Held questions" page.

export { ISSUE_LABELS } from "./issue-labels.js";

export type IntakeStatus = "ready" | "held" | "in_review" | "published" | "rejected";

// A batch of a pipeline connector holds one paper, so its id plus the question's number in that
// paper names one intake item. That holds for questions published straight from the batch and for
// ones a reviewer decides on later (duplicate_reviews keeps the same number).
function inBatch(batchId: string, number?: number) {
  return number === undefined
    ? eq(intakeItems.reviewBatchId, batchId)
    : and(eq(intakeItems.reviewBatchId, batchId), eq(intakeItems.number, number));
}

/** A question from this batch was published (or linked to an existing one). No-op otherwise. */
export async function markIntakePublished(
  db: ReturnType<typeof getDb>,
  batchId: string,
  number: number,
  questionId: string | undefined,
): Promise<void> {
  await db
    .update(intakeItems)
    .set({ status: "published", questionId: questionId ?? null, updatedAt: new Date() })
    .where(inBatch(batchId, number));
}

/** The whole batch, or one of its questions (a reviewer's "skip"), won't be published. */
export async function markIntakeRejected(
  db: ReturnType<typeof getDb>,
  batchId: string,
  number?: number,
): Promise<void> {
  await db
    .update(intakeItems)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(inBatch(batchId, number));
}

export interface IntakePaperSummary {
  paperKey: string;
  edition: string;
  source: string;
  total: number;
  byStatus: Partial<Record<IntakeStatus, number>>;
  /** Held items per issue code (an item with two codes counts under both). */
  heldByIssue: Record<string, number>;
}

/** Per paper and edition: how many items in each status, and why the held ones are held. */
export async function intakeSummary(db: ReturnType<typeof getDb>): Promise<IntakePaperSummary[]> {
  const statusRows = await db.execute(sql`
    SELECT i.paper_key AS "paperKey", i.edition, s.name AS "source", i.status::text AS "status",
           COUNT(*)::int AS "count"
    FROM intake_items i JOIN sources s ON s.id = i.source_id
    GROUP BY i.paper_key, i.edition, s.name, i.status
  `);
  const issueRows = await db.execute(sql`
    SELECT i.paper_key AS "paperKey", i.edition, codes.code, COUNT(DISTINCT i.id)::int AS "count"
    FROM intake_items i,
         LATERAL (SELECT DISTINCT issue->>'code' AS code
                  FROM jsonb_array_elements(i.issues) AS issue) AS codes
    WHERE i.status = 'held'
    GROUP BY i.paper_key, i.edition, codes.code
  `);

  const papers = new Map<string, IntakePaperSummary>();
  for (const row of statusRows.rows as unknown as Array<{
    paperKey: string;
    edition: string;
    source: string;
    status: IntakeStatus;
    count: number;
  }>) {
    const id = `${row.paperKey}\u0000${row.edition}`;
    const paper = papers.get(id) ?? {
      paperKey: row.paperKey,
      edition: row.edition,
      source: row.source,
      total: 0,
      byStatus: {},
      heldByIssue: {},
    };
    paper.byStatus[row.status] = row.count;
    paper.total += row.count;
    papers.set(id, paper);
  }
  for (const row of issueRows.rows as unknown as Array<{
    paperKey: string;
    edition: string;
    code: string;
    count: number;
  }>) {
    const paper = papers.get(`${row.paperKey}\u0000${row.edition}`);
    if (paper) paper.heldByIssue[row.code] = row.count;
  }
  return [...papers.values()].sort((a, b) => a.paperKey.localeCompare(b.paperKey));
}

export interface IntakeItemRow {
  id: string;
  number: number;
  numberLabel: string | null;
  edition: string;
  status: IntakeStatus;
  issues: Array<{ code: string; detail: string }>;
  preview: string;
}

/** One paper's items in a status (held by default), in question order. */
export async function listIntakeItems(
  db: ReturnType<typeof getDb>,
  input: { paperKey: string; status?: IntakeStatus },
): Promise<IntakeItemRow[]> {
  const result = await db.execute(sql`
    SELECT id, number, number_label AS "numberLabel", edition, status::text AS "status", issues,
           LEFT(COALESCE(candidate->>'question_text', ''), 200) AS "preview"
    FROM intake_items
    WHERE paper_key = ${input.paperKey} AND status = ${input.status ?? "held"}::intake_status
    ORDER BY number, edition
  `);
  return result.rows as unknown as IntakeItemRow[];
}
