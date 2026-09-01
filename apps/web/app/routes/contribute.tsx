import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload, FileText, Sparkles, CheckCircle2, Eye, Code, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/contribute")({
  head: () => ({
    meta: [
      { title: "Contribute Question Papers — Prepora" },
      { name: "description", content: "Help thousands of students by contributing past question papers via Markdown or PDF upload. Fast, open, and verified." },
    ],
  }),
  component: ContributePage,
});

function ContributePage() {
  const [tab, setTab] = useState<"markdown" | "pdf">("markdown");
  const [markdownText, setMarkdownText] = useState(
    `# Kerala PSC AE Civil 2025 - Q1\n\nWhat is the SI unit of modulus of elasticity (Young's Modulus)?\n\nA) Newton (N)\nB) N/mm² (or Pascal, Pa)\nC) mm / N\nD) N · mm\n\n**Answer:** B\n**Explanation:** Modulus of elasticity E = Stress / Strain. Stress is measured in N/mm² and strain is dimensionless.`
  );
  const [submitted, setSubmitted] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#080c14] text-slate-100 flex items-center justify-center py-20 px-4">
        <div className="max-w-md w-full p-8 rounded-2xl border border-slate-800 bg-slate-900/50 text-center animate-fade-up">
          <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Contribution Submitted!</h1>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Thank you for contributing. Your submission has been queued for community verification and automated formatting check.
          </p>
          <button
            onClick={() => setSubmitted(false)}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors"
          >
            Submit Another Paper
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-400 text-xs font-mono mb-3">
            <Sparkles className="w-3.5 h-3.5" /> Community Contribution
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-3">
            Contribute Question Papers
          </h1>
          <p className="text-sm text-slate-400">
            Share previous-year exam papers to empower thousands of students. Submit via structured Markdown or direct PDF upload. No account required.
          </p>
        </div>

        {/* Form Container */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="space-y-8"
        >
          {/* Metadata Section */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 space-y-4">
            <h2 className="text-xs font-mono uppercase tracking-wider text-slate-400">Exam Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label htmlFor="contrib-exam" className="block text-xs font-mono text-slate-400 mb-1.5">
                  Exam Organization <span className="text-rose-400">*</span>
                </label>
                <input
                  id="contrib-exam"
                  required
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Kerala PSC"
                />
              </div>

              <div>
                <label htmlFor="contrib-variant" className="block text-xs font-mono text-slate-400 mb-1.5">
                  Variant / Post Name
                </label>
                <input
                  id="contrib-variant"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Assistant Engineer"
                />
              </div>

              <div>
                <label htmlFor="contrib-year" className="block text-xs font-mono text-slate-400 mb-1.5">
                  Exam Year
                </label>
                <input
                  id="contrib-year"
                  type="number"
                  min="1990"
                  max="2030"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. 2025"
                />
              </div>

              <div>
                <label htmlFor="contrib-subject" className="block text-xs font-mono text-slate-400 mb-1.5">
                  Subject Branch
                </label>
                <input
                  id="contrib-subject"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Civil Engineering"
                />
              </div>
            </div>
          </div>

          {/* Submission Mode Selector */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800 w-fit">
              <button
                type="button"
                onClick={() => setTab("markdown")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono transition-all ${
                  tab === "markdown" ? "bg-slate-950 text-white shadow-sm border border-slate-800" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Code className="w-3.5 h-3.5" /> Structured Markdown
              </button>
              <button
                type="button"
                onClick={() => setTab("pdf")}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono transition-all ${
                  tab === "pdf" ? "bg-slate-950 text-white shadow-sm border border-slate-800" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Upload className="w-3.5 h-3.5" /> Upload PDF Paper
              </button>
            </div>

            {/* Split Screen Markdown Editor */}
            {tab === "markdown" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Editor Column */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="markdown-input" className="text-xs font-mono text-slate-400 uppercase">
                      Input Markdown
                    </label>
                    <span className="text-[11px] font-mono text-slate-500">Supports Math & Code</span>
                  </div>
                  <textarea
                    id="markdown-input"
                    value={markdownText}
                    onChange={(e) => setMarkdownText(e.target.value)}
                    rows={14}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-950 p-4 text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500 leading-relaxed resize-y"
                    placeholder="Paste Prepora formatted markdown here..."
                  />
                </div>

                {/* Live Preview Column */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400 uppercase flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5 text-blue-400" /> Live Rendered Card
                    </span>
                    <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Auto Validated
                    </span>
                  </div>
                  <div className="p-6 rounded-2xl border border-slate-800/90 bg-slate-900/50 min-h-[300px] space-y-4">
                    <div className="text-xs font-mono text-blue-400">Preview Mode</div>
                    <div className="whitespace-pre-wrap text-xs text-slate-300 font-sans leading-relaxed">
                      {markdownText}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* PDF Dropzone */
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                className={`p-12 rounded-2xl border-2 border-dashed text-center transition-all cursor-pointer ${
                  dragOver ? "border-blue-500 bg-blue-950/20" : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
                }`}
              >
                <Upload className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <h3 className="text-sm font-semibold text-white mb-1">Drag and drop original PDF file</h3>
                <p className="text-xs text-slate-400 mb-4">Max size 20MB. PDF files will be automatically parsed & split into questions.</p>
                <input type="file" accept="application/pdf" className="sr-only" id="pdf-file-input" />
                <label
                  htmlFor="pdf-file-input"
                  className="px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 hover:bg-slate-900 transition-colors inline-block"
                >
                  Browse Files
                </label>
              </div>
            )}
          </div>

          {/* Submit Toolbar */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Reviewed by Prepora core maintainers before publishing
            </div>

            <button
              type="submit"
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-blue-600/20"
            >
              Submit Contribution
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
