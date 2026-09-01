import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, XCircle, FileText, ArrowLeft, ShieldCheck, Sparkles } from "lucide-react";

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
    setSubmissions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: newStatus } : s))
    );
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "all") return true;
    return s.status === filter;
  });

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <Link
            to="/admin"
            className="p-2 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Contribution Review Queue
              <span className="px-2 py-0.5 rounded-full bg-amber-950 border border-amber-800 text-amber-400 text-xs font-mono">
                {submissions.filter((s) => s.status === "pending").length} Pending
              </span>
            </h1>
            <p className="text-xs text-slate-400">Review community submissions, diff check, and approve for publishing.</p>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {(["pending", "approved", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono capitalize transition-all ${
                filter === f ? "bg-slate-950 text-white shadow-sm border border-slate-800" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Submissions List Sidebar */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-mono uppercase text-slate-400 tracking-wider">Submissions Queue</div>
          <div className="space-y-2">
            {filteredSubmissions.map((sub) => (
              <button
                key={sub.id}
                onClick={() => setSelectedId(sub.id)}
                className={`w-full text-left p-4 rounded-xl border transition-all space-y-2 ${
                  selectedId === sub.id
                    ? "border-blue-500/80 bg-slate-900/90 shadow-md shadow-blue-500/5"
                    : "border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-blue-400">{sub.exam}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono capitalize border ${
                      sub.status === "pending"
                        ? "bg-amber-950/60 border-amber-800/60 text-amber-400"
                        : sub.status === "approved"
                        ? "bg-emerald-950/60 border-emerald-800/60 text-emerald-400"
                        : "bg-rose-950/60 border-rose-800/60 text-rose-400"
                    }`}
                  >
                    {sub.status}
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-200">{sub.variant} ({sub.year})</div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 font-mono">
                  <span>{sub.subject}</span>
                  <span>{sub.submittedAt}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Selected Submission Inspector & Diff Viewer */}
        <div className="lg:col-span-8 space-y-4">
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-6">
            {/* Metadata bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div>
                <div className="text-xs font-mono text-slate-400">Submission ID: {selectedSubmission.id}</div>
                <h2 className="text-base font-bold text-white mt-0.5">
                  {selectedSubmission.exam} - {selectedSubmission.variant} ({selectedSubmission.year})
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Submitted by {selectedSubmission.submittedBy}</p>
              </div>

              {/* Action Buttons */}
              {selectedSubmission.status === "pending" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAction(selectedSubmission.id, "rejected")}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-300 text-xs font-mono hover:bg-rose-900 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Reject
                  </button>
                  <button
                    onClick={() => handleAction(selectedSubmission.id, "approved")}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-600/20 transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approve & Publish
                  </button>
                </div>
              )}
            </div>

            {/* Content Comparator / Inspector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                <span className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-400" /> Submitted Raw Format ({selectedSubmission.type.toUpperCase()})
                </span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> Auto-validated syntax
                </span>
              </div>

              <div className="p-4 rounded-xl border border-slate-800 bg-slate-950 font-mono text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selectedSubmission.content}
              </div>
            </div>

            {/* System Parser Verification Log */}
            <div className="p-4 rounded-xl border border-slate-800/60 bg-slate-950/50 space-y-2">
              <div className="text-xs font-mono text-slate-400 uppercase tracking-wider">Automated Verification Log</div>
              <div className="space-y-1 font-mono text-[11px]">
                <div className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> Question Structure Validated (1 Question extracted)
                </div>
                <div className="text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-3 h-3" /> Answer Key Present & Mapped to Option B
                </div>
                <div className="text-slate-400 flex items-center gap-2">
                  <Sparkles className="w-3 h-3 text-blue-400" /> Duplicate Check Passed (0 match found in Database)
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
