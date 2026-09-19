import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/admin/contributions")({
  head: () => ({ meta: [{ title: "Contribution Queue — Admin — Prepora" }] }),
  component: AdminContributionsPage,
});

interface Submission {
  id: string;
  exam: string;
  variant: string;
  year: number;
  subject: string;
  submittedBy: string;
  submittedAt: string;
  type: "markdown" | "pdf";
  status: "pending" | "approved" | "rejected";
  content: string;
}

const mockSubmissions: Submission[] = [
  {
    id: "sub-101",
    exam: "Kerala PSC",
    variant: "Assistant Engineer",
    year: 2025,
    subject: "Civil Engineering",
    submittedBy: "Rahul V. (rahul@example.com)",
    submittedAt: "10 mins ago",
    type: "markdown",
    status: "pending",
    content: `# Question 1\nWhat is the SI unit of modulus of elasticity (Young's Modulus)?\nA) Newton (N)\nB) N/mm² (or Pascal, Pa)\nC) mm / N\nD) N · mm\n\nAnswer: B\nExplanation: Young's Modulus is defined as stress over strain. Unit is N/mm² or Pa.`,
  },
  {
    id: "sub-102",
    exam: "SSC CGL",
    variant: "Tier 1 General Awareness",
    year: 2024,
    subject: "Indian Polity",
    submittedBy: "Anonymous",
    submittedAt: "1 hour ago",
    type: "pdf",
    status: "pending",
    content: "[PDF File Attached: SSC_CGL_2024_Polity.pdf - 4.2 MB]",
  },
  {
    id: "sub-103",
    exam: "GATE",
    variant: "Computer Science",
    year: 2025,
    subject: "Algorithms",
    submittedBy: "Ananya S.",
    submittedAt: "2 hours ago",
    type: "markdown",
    status: "approved",
    content: `# GATE CS 2025 Q14\nWhat is the worst-case time complexity of QuickSort?\nA) O(n log n)\nB) O(n²)\nC) O(n)\nD) O(log n)\n\nAnswer: B`,
  },
];

function AdminContributionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>(mockSubmissions);
  const [selectedId, setSelectedId] = useState<string>("sub-101");
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");

  const selectedSubmission = submissions.find((s) => s.id === selectedId) || submissions[0];

  const handleAction = (id: string, newStatus: "approved" | "rejected") => {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

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
                {submissions.filter((s) => s.status === "pending").length} ACTIVE PENDING
              </span>
            </h1>
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
              Community Contributions / Diff Inspection Protocol
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
          <div className="p-8 border-b border-slate-900">
            <div className="text-[10px] font-mono uppercase text-slate-600 tracking-[0.3em]">
              {/* Transaction Log */}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-slate-900">
            {filteredSubmissions.map((sub) => {
              const isSelected = selectedId === sub.id;
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
                      <span className="text-[10px] font-mono tracking-widest text-[#00ff9d] uppercase">
                        Node_ID: {sub.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase tracking-widest ${
                          sub.status === "pending"
                            ? "text-amber-500"
                            : sub.status === "approved"
                              ? "text-emerald-500"
                              : "text-red-500"
                        }`}
                      >
                        [{sub.status}]
                      </span>
                    </div>

                    <div>
                      <h3 className="text-lg text-white font-light uppercase tracking-wide group-hover:text-white transition-colors mb-2">
                        {sub.exam} — {sub.variant}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                        <span>{sub.subject}</span>
                        <span>{sub.year}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected Submission Inspector & Diff Viewer */}
        <div className="lg:col-span-8 bg-[#06080a] h-[calc(100vh-109px)] overflow-y-auto">
          {/* Metadata Matrix */}
          <div className="p-8 md:p-12 border-b border-slate-900">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-12">
              <div>
                <div className="text-[10px] font-mono tracking-[0.3em] text-slate-600 uppercase mb-6">
                  {/* Inspector Metadata */}
                </div>
                <h2 className="text-3xl md:text-5xl font-light text-white uppercase tracking-tighter leading-none mb-6">
                  {selectedSubmission.exam} <br /> {selectedSubmission.variant}
                </h2>
                <div className="flex flex-col gap-4">
                  <span className="text-[10px] font-mono tracking-widest uppercase border-b border-slate-900/50 pb-2">
                    <span className="text-slate-600">SRC: </span>
                    <span className="text-slate-300">{selectedSubmission.submittedBy}</span>
                  </span>
                  <span className="text-[10px] font-mono tracking-widest uppercase">
                    <span className="text-slate-600">TIMESTAMP: </span>
                    <span className="text-slate-300">{selectedSubmission.submittedAt}</span>
                  </span>
                </div>
              </div>

              {/* Protocol Actions */}
              <div className="shrink-0 flex flex-col gap-4 min-w-[240px]">
                {selectedSubmission.status === "pending" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction(selectedSubmission.id, "approved")}
                      className="w-full px-6 py-4 border border-emerald-500 hover:bg-emerald-500 text-emerald-500 hover:text-black font-mono text-xs tracking-widest uppercase transition-colors text-center"
                    >
                      APPROVE_COMMIT
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(selectedSubmission.id, "rejected")}
                      className="w-full px-6 py-4 border border-red-900 hover:border-red-500 hover:bg-red-950/20 text-red-500 font-mono text-xs tracking-widest uppercase transition-colors text-center"
                    >
                      REJECT_DISCARD
                    </button>
                  </>
                ) : (
                  <div className="px-6 py-4 border border-slate-800 bg-slate-900/30 text-slate-500 font-mono text-xs tracking-widest uppercase text-center cursor-not-allowed">
                    OPERATION EXECUTED
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-8 md:p-12 flex flex-col lg:flex-row gap-12">
            {/* Raw Buffer Output */}
            <div className="flex-1">
              <div className="flex items-center justify-between text-[10px] font-mono tracking-[0.3em] text-slate-600 uppercase mb-8 border-b border-slate-900 pb-4">
                <span>
                  {/* Buffer: */}
                  {selectedSubmission.type.toUpperCase()}
                </span>
                <span className="text-[#00ff9d]">SYNTAX_OK</span>
              </div>

              <div className="p-8 border border-slate-900 bg-black text-slate-300 font-mono text-sm leading-8 whitespace-pre-wrap">
                {selectedSubmission.content}
              </div>
            </div>

            {/* Diagnostic Sidebar */}
            <aside className="lg:w-80 shrink-0">
              <div className="text-[10px] font-mono tracking-[0.3em] text-slate-600 uppercase mb-8 border-b border-slate-900 pb-4">
                {/* System Diagnostics */}
              </div>

              <ul className="space-y-6 font-mono text-[10px] tracking-widest uppercase">
                <li className="flex gap-4">
                  <span className="text-[#00ff9d] shrink-0 mt-1">[OK]</span>
                  <span className="text-slate-400 leading-snug">
                    Structural integrity verified. One root node extracted.
                  </span>
                </li>
                <li className="flex gap-4">
                  <span className="text-[#00ff9d] shrink-0 mt-1">[OK]</span>
                  <span className="text-slate-400 leading-snug">
                    Resolution key located {"->"} Mapped to Option_B.
                  </span>
                </li>
                <li className="flex gap-4">
                  <span className="text-slate-600 shrink-0 mt-1">[--]</span>
                  <span className="text-slate-600 leading-snug">
                    Collision detection passed. 0 historical matches.
                  </span>
                </li>
              </ul>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
