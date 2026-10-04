import { ISSUE_LABELS } from "@prepora/api/src/shared";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Inbox } from "lucide-react";
import { Fragment, useState } from "react";
import { orpc } from "../../../lib/orpc";
import { verifyAdminFn } from "../admin";

// docs/specs/07-intake.md: every question a pipeline connector parses is stored as an intake item,
// `ready` or `held` with the reasons. This page shows what's waiting, per paper, and why — the
// work list for the fixes in Spec 9 (a better source, a crop, OCR, a transcription).

export const Route = createFileRoute("/admin/intake")({
  beforeLoad: async () => {
    const res = await verifyAdminFn();
    if (!res.ok) throw new Error("Unauthorized");
  },
  component: AdminIntakePage,
});

const STATUSES = ["ready", "in_review", "published", "held", "rejected"] as const;
const STATUS_LABELS: Record<(typeof STATUSES)[number], string> = {
  ready: "Ready",
  in_review: "In review",
  published: "Published",
  held: "Held",
  rejected: "Rejected",
};

function AdminIntakePage() {
  const { data: papers, isLoading } = useQuery(orpc.admin.getIntakeSummary.queryOptions());
  const [open, setOpen] = useState<string | null>(null);

  const totals = (papers ?? []).reduce(
    (sum, p) => ({ total: sum.total + p.total, held: sum.held + (p.byStatus.held ?? 0) }),
    { total: 0, held: 0 },
  );

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans pb-32">
      <div className="px-6 pt-10 max-w-[1400px] mx-auto mb-12">
        <Link
          to="/admin"
          className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO ADMIN OVERVIEW
        </Link>
      </div>

      <main className="max-w-[1400px] mx-auto px-6">
        <div className="mb-10 border-b border-slate-800 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
              <Inbox className="w-5 h-5 text-slate-300" />
            </span>
            <h1 className="text-4xl text-white font-medium tracking-tight">Held questions</h1>
          </div>
          <p className="font-mono text-xs text-slate-500 max-w-3xl">
            Every question a connector reads is stored here first. Clean ones go to the review
            queue; ones whose text can't be trusted yet are held, with the reason, until a fix
            clears it. Nothing is dropped.
          </p>
          {papers && (
            <p className="mt-4 text-sm text-slate-400">
              {totals.total} questions from {papers.length} papers · {totals.held} held
            </p>
          )}
        </div>

        {isLoading && <p className="font-mono text-xs text-slate-500">Loading…</p>}
        {papers && papers.length === 0 && (
          <p className="text-slate-400">
            Nothing in intake yet. Run a connector, for example <code>gate-import</code>.
          </p>
        )}

        {papers && papers.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
                  <th className="py-3 pr-4">Paper</th>
                  <th className="py-3 pr-4">Source</th>
                  {STATUSES.map((s) => (
                    <th key={s} className="py-3 pr-4 text-right">
                      {STATUS_LABELS[s]}
                    </th>
                  ))}
                  <th className="py-3">Why held</th>
                </tr>
              </thead>
              <tbody>
                {papers.map((p) => {
                  const id = `${p.paperKey} ${p.edition}`;
                  const held = p.byStatus.held ?? 0;
                  return (
                    <Fragment key={id}>
                      <tr className="border-b border-slate-900 align-top">
                        <td className="py-3 pr-4 font-mono text-xs text-white">
                          {p.paperKey}
                          <span className="text-slate-600"> · {p.edition}</span>
                        </td>
                        <td className="py-3 pr-4 text-slate-400">{p.source}</td>
                        {STATUSES.map((s) => (
                          <td key={s} className="py-3 pr-4 text-right tabular-nums">
                            {p.byStatus[s] ?? 0}
                          </td>
                        ))}
                        <td className="py-3">
                          <ul className="space-y-1 text-xs text-slate-400">
                            {Object.entries(p.heldByIssue)
                              .sort((a, b) => b[1] - a[1])
                              .map(([code, n]) => (
                                <li key={code}>
                                  {n} · {ISSUE_LABELS[code] ?? code}
                                </li>
                              ))}
                          </ul>
                          {held > 0 && (
                            <button
                              type="button"
                              onClick={() => setOpen(open === p.paperKey ? null : p.paperKey)}
                              className="mt-2 font-mono text-[10px] uppercase tracking-widest text-sky-400 hover:text-white"
                            >
                              {open === p.paperKey ? "Hide held questions" : "Show held questions"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {open === p.paperKey && (
                        <tr className="border-b border-slate-900">
                          <td colSpan={STATUSES.length + 3} className="pb-6">
                            <HeldItems paperKey={p.paperKey} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function HeldItems({ paperKey }: { paperKey: string }) {
  const { data: items, isLoading } = useQuery(
    orpc.admin.listIntakeItems.queryOptions({ input: { paperKey, status: "held" } }),
  );
  if (isLoading) return <p className="mt-3 font-mono text-xs text-slate-500">Loading…</p>;
  return (
    <ol className="mt-3 space-y-3">
      {(items ?? []).map((item) => (
        <li key={item.id} className="border-l border-slate-800 pl-3">
          <div className="font-mono text-[11px] text-slate-500">
            {item.numberLabel ?? `Q.${item.number}`} · {item.edition}
          </div>
          <div className="text-slate-300">{item.preview || "(no text)"}</div>
          <div className="text-xs text-amber-400/80">
            {item.issues
              .map((issue) => `${ISSUE_LABELS[issue.code] ?? issue.code}: ${issue.detail}`)
              .join(" · ")}
          </div>
        </li>
      ))}
    </ol>
  );
}
