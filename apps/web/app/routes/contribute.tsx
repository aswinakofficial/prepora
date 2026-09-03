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
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full border-[0.5px] border-white/10 bg-[#06080a] p-12 shadow-2xl">
          <div className="space-y-4">
            <h1 className="font-mono text-2xl tracking-tighter text-white uppercase flex items-center gap-3">
              <span className="text-white/30 text-base">»</span> Transmission Accepted
            </h1>
            <p className="font-mono text-[11px] tracking-widest text-slate-500 uppercase leading-relaxed">
              Your data has been successfully injected into the community queue. 
              Verification algorithms are processing structural components.
            </p>
          </div>
          <div className="pt-12 mt-12 border-t-[0.5px] border-white/5 space-y-4">
            <button
              onClick={() => setSubmitted(false)}
              className="w-full font-mono uppercase tracking-widest text-[10px] h-12 bg-transparent text-white hover:bg-white hover:text-black border-[0.5px] border-white/20 transition-all rounded-none"
            >
              Initialize New Submission
            </button>
            <a href="/" className="flex items-center justify-center w-full font-mono uppercase tracking-widest text-[9px] text-slate-500 hover:text-white transition-colors h-12">
              Return to Core
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 selection:bg-slate-700 selection:text-white font-sans flex flex-col">
      {/* Editorial Header (Consistent with Root) */}
      <header className="border-b border-slate-900/80 mb-24 shrink-0">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-12 text-xs font-mono tracking-widest uppercase">
          <div className="col-span-1 md:col-span-3 border-b md:border-b-0 md:border-r border-slate-900/50 p-6 flex flex-col justify-center">
            <a href="/" className="text-white font-bold tracking-[0.3em] hover:text-slate-400 transition-colors">
              PREPORA
            </a>
          </div>
          <div className="col-span-1 md:col-span-6 p-6 flex items-center gap-8 md:gap-12 overflow-x-auto border-b md:border-b-0 md:border-r border-slate-900/50">
            <span className="text-white/30">/</span>
            <span className="text-white">Contribute</span>
          </div>
          <div className="col-span-1 md:col-span-3 p-6 flex items-center justify-between md:justify-end gap-6">
            <span className="text-slate-600 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> SECURE TUNNEL
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] w-full mx-auto px-6 pb-32 flex-1">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Asymmetric Spacer / Context Col */}
          <div className="col-span-1 md:col-span-3 lg:col-span-3 border-r border-slate-900/50 pr-6 space-y-12 h-full hidden md:block">
            <div>
              <h2 className="text-white tracking-tighter text-3xl font-light mb-6">
                GROW<br/>THE INDEX.
              </h2>
              <p className="font-mono text-[10px] uppercase text-slate-500 tracking-widest leading-relaxed">
                Empower thousands of students by injecting raw verified exam papers into our structural datasets.
              </p>
            </div>
            <div className="pt-12 border-t border-slate-900/50">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-500 mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
                SYSTEM READY
              </div>
              <p className="font-mono text-xs text-slate-600 uppercase">
                Awaiting Data Vector
              </p>
            </div>
          </div>
          
          <div className="col-span-1 md:col-span-9 lg:col-span-8 md:pl-6 pb-24">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(true);
              }}
              className="space-y-24 max-w-4xl"
            >
              {/* Exam Matrix */}
              <div className="space-y-12">
                <h3 className="font-mono text-xs text-slate-500 tracking-[0.2em] uppercase border-b border-slate-900 pb-4">
                  01 / Metadata Identity
                </h3>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12">
                  <div className="flex flex-col gap-4">
                    <label className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                      Origin Authority <span className="text-white">*</span>
                    </label>
                    <input
                      required
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Kerala PSC"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                      Classification / Post Name
                    </label>
                    <input
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Assistant Engineer"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                      Temporal Stamp (Year)
                    </label>
                    <input
                      type="number"
                      min="1990"
                      max="2030"
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="YYYY"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                      Domain Sector
                    </label>
                    <input
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Civil Engineering"
                    />
                  </div>
                </div>
              </div>

              {/* Data Vector Stream */}
              <div className="space-y-12">
                <div className="flex items-end justify-between border-b border-slate-900 pb-4">
                  <h3 className="font-mono text-xs text-slate-500 tracking-[0.2em] uppercase">
                    02 / Content Payload
                  </h3>
                  
                  <div className="font-mono text-[10px] tracking-widest flex gap-6 uppercase">
                    <button
                      type="button"
                      onClick={() => setTab("markdown")}
                      className={`transition-colors ${tab === "markdown" ? "text-white border-b border-white pb-1" : "text-slate-600 hover:text-slate-400"}`}
                    >
                      [ Markdown ]
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("pdf")}
                      className={`transition-colors ${tab === "pdf" ? "text-white border-b border-white pb-1" : "text-slate-600 hover:text-slate-400"}`}
                    >
                      [ Binary PDF ]
                    </button>
                  </div>
                </div>

                {tab === "markdown" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="flex flex-col relative group">
                      <div className="absolute top-4 right-4 font-mono text-[9px] text-slate-600 uppercase">Input Node</div>
                      <textarea
                        value={markdownText}
                        onChange={(e) => setMarkdownText(e.target.value)}
                        rows={16}
                        className="w-full bg-[#030406] border border-slate-800 p-6 text-[11px] font-mono leading-relaxed text-slate-400 focus:outline-none focus:border-slate-500 focus:text-slate-200 transition-colors resize-y shadow-inner"
                        placeholder="Insert Prepora markdown blocks..."
                      />
                    </div>
                    
                    <div className="flex flex-col relative">
                      <div className="absolute top-4 right-4 font-mono text-[9px] text-emerald-500/50 uppercase">Render Output</div>
                      <div className="w-full bg-[#0a0c10] border border-slate-800/50 p-6 min-h-[300px]">
                        <div className="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed">
                          {markdownText}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    className={`border border-dashed transition-all p-20 flex flex-col items-center justify-center cursor-pointer ${
                      dragOver ? "border-white bg-white/5" : "border-slate-800 bg-[#030406] hover:border-slate-600"
                    }`}
                  >
                    <Upload className="w-8 h-8 text-slate-700 mb-6" />
                    <span className="font-mono text-xs text-white uppercase tracking-widest mb-4">DRAG & DROP SECURE PDF</span>
                    <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest max-w-[200px] text-center">
                      Auto-parsing engine engaged. Max chunk limit 20MB.
                    </span>
                    <input type="file" accept="application/pdf" className="sr-only" id="pdf-upload" />
                    <label htmlFor="pdf-upload" className="mt-10 border border-slate-700 px-6 py-2 font-mono text-[10px] text-slate-400 hover:text-white uppercase tracking-widest hover:border-white transition-colors cursor-pointer">
                      Select Object
                    </label>
                  </div>
                )}
              </div>

              {/* Execution */}
              <div className="pt-16 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-8">
                <span className="font-mono text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-3">
                  <span className="w-1 h-3 bg-slate-600 block" /> Subject To Manual Validation By Core Operators
                </span>
                <button
                  type="submit"
                  className="w-full md:w-auto font-mono uppercase tracking-widest text-[11px] h-14 bg-white text-black hover:bg-transparent hover:text-white border border-white transition-all rounded-none px-12"
                >
                  Execute Upload
                </button>
              </div>

            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
