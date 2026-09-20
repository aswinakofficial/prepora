import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/admin/contributions")({
  head: () => ({ meta: [{ title: "Contribution Queue — Admin — Prepora" }] }),
  component: AdminContributionsPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to hold three fake submissions in
// local state with no persistence at all — approving or rejecting one just updated React state and
// vanished on refresh. It now reads and writes the real `contributions` table via
// contributions.list / contributions.updateStatus. The fabricated "System Diagnostics" panel
// ("Structural integrity verified", "0 historical matches") has been removed rather than kept as
// placeholder content, since it never reflected any real check.

function AdminContributionsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");

  const { data: submissions = [], isLoading } = useQuery(
    orpc.contributions.list.queryOptions({
      input: { status: filter === "all" ? undefined : filter },
    }),
  );

  const { mutateAsync: updateStatus, isPending: isUpdating } = useMutation(
    orpc.contributions.updateStatus.mutationOptions(),
  );

  const selectedSubmission = submissions.find((s) => s.id === selectedId) || submissions[0];

  const handleAction = async (id: string, newStatus: "approved" | "rejected") => {
    await updateStatus({ id, status: newStatus });
    queryClient.invalidateQueries({ queryKey: orpc.contributions.list.queryKey() });
  };

  const pendingCount = submissions.filter((s) => s.status === "pending").length;

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white flex flex-col">
      {/* Top Protocol Header */}
      <div className="px-8 py-10 flex items-center justify-between border-b border-slate-900 sticky top-0 bg-[#06080a] z-20">
        <div className="flex items-center gap-8">
          <Link
            to="/admin"
            className="font-mono text-[10px] uppercase text-slate-500 hover:text-white border-b border-transparent hover:border-slate-500 transition-colors pb-1 flex items-center gap-2"
          >
            ← Root
          </Link>
          <div>
            <h1 className="text-2xl font-light text-white uppercase tracking-widest mb-1 flex items-center gap-4">
              Ingestion Queue
              <span className="font-mono text-[10px] tracking-widest px-2 py-0.5 border border-amber-900 bg-amber-950/20 text-amber-500">
                {pendingCount} ACTIVE PENDING
              </span>
            </h1>
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
              Community Contributions / Review Queue
            </p>
          </div>
        </div>

        {/* Filter Matrix */}
        <div className="flex items-center gap-2">
          {(["pending", "approved", "all"] as const).map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-all ${
                filter === f
                  ? "bg-slate-200 text-black border border-slate-200"
                  : "bg-transparent border border-slate-800 text-slate-500 hover:text-white hover:border-slate-600"
              }`}
            >
              / {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Matrix Split */}
      <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-12">
        {/* Submissions List Sidebar */}
        <div className="lg:col-span-4 border-r border-slate-900 flex flex-col h-[calc(100vh-109px)]">
          <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-slate-900">
            {isLoading ? (
              <div className="p-8 font-mono text-sm text-slate-500">Loading…</div>
            ) : submissions.length === 0 ? (
              <div className="p-8 font-mono text-sm text-slate-500">No contributions found.</div>
            ) : (
              submissions.map((sub) => {
                const isSelected = (selectedId || submissions[0]?.id) === sub.id;
                return (
                  <button
                    type="button"
                    key={sub.id}
                    onClick={() => setSelectedId(sub.id)}
                    className={`w-full text-left p-8 transition-colors group ${
                      isSelected ? "bg-slate-900/40" : "hover:bg-slate-900/20"
                    }`}
                  >
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono tracking-widest text-[#00ff9d] uppercase truncate max-w-[60%]">
                          {sub.id}
                        </span>
                        <span
                          className={`text-[10px] font-mono uppercase tracking-widest ${
                            sub.status === "pending"
                              ? "text-amber-500"
                              : sub.status === "approved"
                                ? "text-emerald-500"
                                : sub.status === "rejected"
                                  ? "text-red-500"
                                  : "text-slate-500"
                          }`}
                        >
                          [{sub.status}]
                        </span>
                      </div>

                      <div>
                        <h3 className="text-lg text-white font-light uppercase tracking-wide group-hover:text-white transition-colors mb-2">
                          {sub.title || sub.examSlug || "Untitled contribution"}
                        </h3>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                          <span>{sub.subjectSlug || "—"}</span>
                          <span>{sub.year || ""}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Submission Inspector */}
        <div className="lg:col-span-8 bg-[#06080a] h-[calc(100vh-109px)] overflow-y-auto">
          {!selectedSubmission ? (
            <div className="p-12 font-mono text-sm text-slate-500">
              Select a contribution to review.
            </div>
          ) : (
            <>
              {/* Metadata Matrix */}
              <div className="p-8 md:p-12 border-b border-slate-900">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-12">
                  <div>
                    <h2 className="text-3xl md:text-5xl font-light text-white uppercase tracking-tighter leading-none mb-6">
                      {selectedSubmission.title || selectedSubmission.examSlug || "Untitled"}
                    </h2>
                    <div className="flex flex-col gap-4">
                      <span className="text-[10px] font-mono tracking-widest uppercase border-b border-slate-900/50 pb-2">
                        <span className="text-slate-600">SRC: </span>
                        <span className="text-slate-300">
                          {selectedSubmission.contributorName ||
                            selectedSubmission.contributorEmail ||
                            "Anonymous"}
                        </span>
                      </span>
                      <span className="text-[10px] font-mono tracking-widest uppercase">
                        <span className="text-slate-600">SUBMITTED: </span>
                        <span className="text-slate-300">
                          {new Date(selectedSubmission.createdAt).toLocaleString()}
                        </span>
                      </span>
                      {selectedSubmission.reviewNote && (
                        <span className="text-[10px] font-mono tracking-widest uppercase">
                          <span className="text-slate-600">REVIEW NOTE: </span>
                          <span className="text-slate-300">{selectedSubmission.reviewNote}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Protocol Actions */}
                  <div className="shrink-0 flex flex-col gap-4 min-w-[240px]">
                    {selectedSubmission.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleAction(selectedSubmission.id, "approved")}
                          className="w-full px-6 py-4 border border-emerald-500 hover:bg-emerald-500 text-emerald-500 hover:text-black font-mono text-xs tracking-widest uppercase transition-colors text-center disabled:opacity-40"
                        >
                          APPROVE
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleAction(selectedSubmission.id, "rejected")}
                          className="w-full px-6 py-4 border border-red-900 hover:border-red-500 hover:bg-red-950/20 text-red-500 font-mono text-xs tracking-widest uppercase transition-colors text-center disabled:opacity-40"
                        >
                          REJECT
                        </button>
                      </>
                    ) : (
                      <div className="px-6 py-4 border border-slate-800 bg-slate-900/30 text-slate-500 font-mono text-xs tracking-widest uppercase text-center cursor-not-allowed">
                        {selectedSubmission.status.toUpperCase()}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-8 md:p-12">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.3em] text-slate-600 uppercase mb-8 border-b border-slate-900 pb-4">
                  <span>{selectedSubmission.markdownContent ? "MARKDOWN" : "PDF"}</span>
                </div>

                <div className="p-8 border border-slate-900 bg-black text-slate-300 font-mono text-sm leading-8 whitespace-pre-wrap">
                  {selectedSubmission.markdownContent ||
                    (selectedSubmission.pdfStorageKey
                      ? `[PDF: ${selectedSubmission.pdfStorageKey}]`
                      : "No content.")}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
