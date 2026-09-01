import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/exams/$examSlug/")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.examSlug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())} — Question Repository | Prepora` },
      { name: "description", content: `Explore official previous-year question sets, subject breakdowns, and topic-wise practice for ${params.examSlug}.` },
    ],
  }),
  component: ExamPage,
});

function ExamPage() {
  const { examSlug } = Route.useParams();
  const examName = examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const variants = [
    { slug: "assistant-engineer", name: "Assistant Engineer (AE)", count: "1,200 Qs", tag: "Civil / Mech / Elec" },
    { slug: "junior-engineer", name: "Junior Engineer (JE)", count: "800 Qs", tag: "Diploma / Degree" },
    { slug: "degree-level", name: "Degree Level Preliminary", count: "600 Qs", tag: "General Studies" },
  ];

  const subjects = [
    { slug: "fluid-mechanics", name: "Fluid Mechanics & Hydraulics", questionCount: 240, subtopics: 8 },
    { slug: "structural-analysis", name: "Structural Analysis & RCC", questionCount: 310, subtopics: 12 },
    { slug: "environmental-engineering", name: "Environmental Engineering", questionCount: 180, subtopics: 6 },
    { slug: "surveying", name: "Surveying & Geomatics", questionCount: 150, subtopics: 5 },
  ];

  const papers = [
    { year: 2025, title: "Kerala PSC AE Civil Paper I 2025", questions: 100, code: "2025/AE-01" },
    { year: 2024, title: "Kerala PSC AE Civil Paper I 2024", questions: 100, code: "2024/AE-01" },
    { year: 2023, title: "Kerala PSC AE Civil Paper I 2023", questions: 100, code: "2023/AE-01" },
  ];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link to="/exams" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
          ← BACK TO EXAMS
        </Link>
      </header>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/exams" className="hover:text-white transition-colors">EXAMS</Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">{examSlug}</span>
        </div>

        {/* Top Header Section */}
        <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              {examName.toUpperCase()}
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase">
              Official Hub <span className="mx-4">|</span> Step-by-Step Explanations <span className="mx-4">|</span> 99.4% Verified
            </p>
          </div>

          <Link
            to="/practice"
            className="font-mono text-xs uppercase tracking-[0.2em] text-white border border-slate-600 px-6 py-4 hover:bg-white hover:text-black transition-colors shrink-0 text-center"
          >
            [ INITIATE ENVIRONMENT ]
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-16">
          {/* Index Main Content */}
          <div className="lg:col-span-3 space-y-24">
            
            {/* Exam Variants Section */}
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
                // Variants & Posts
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-900">
                {variants.map((v) => (
                  <div key={v.slug} className="bg-[#06080a] p-8 border border-slate-900/50 hover:bg-slate-900/30 transition-colors">
                    <div className="font-mono text-[10px] text-slate-600 tracking-widest mb-4 uppercase">
                      {v.tag}
                    </div>
                    <h3 className="text-xl text-slate-200 font-light mb-4">{v.name}</h3>
                    <div className="font-mono text-xs tracking-widest text-slate-500">
                      VOL: {v.count}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Subject Hierarchy */}
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
                // Subject Structure
              </h2>
              <div className="border-t-2 border-slate-900 border-b-2">
                {subjects.map((sub, idx) => (
                  <Link
                    key={sub.slug}
                    to={`/exams/${examSlug}/subjects/${sub.slug}` as any}
                    className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-slate-900/50 hover:bg-slate-900/40 transition-colors group"
                  >
                    <div className="flex items-center gap-6">
                      <span className="font-mono text-sm text-slate-600 w-8">{String(idx + 1).padStart(2, '0')}</span>
                      <h3 className="text-xl text-slate-300 group-hover:text-white transition-colors font-light">
                        {sub.name}
                      </h3>
                    </div>
                    <div className="font-mono text-[10px] uppercase text-slate-500 tracking-widest mt-4 md:mt-0">
                      {sub.subtopics} CLUSTERS <span className="mx-4 text-slate-800">|</span> {sub.questionCount} Qs
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            {/* Official Papers Log */}
            <section>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
                // Official Papers
              </h2>
              <div className="border-t border-slate-900 border-b">
                <div className="hidden md:grid grid-cols-10 p-4 border-b border-slate-900 font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                  <div className="col-span-2">YEAR</div>
                  <div className="col-span-4">PAPER TITLE</div>
                  <div className="col-span-3">REF CODE</div>
                  <div className="col-span-1 text-right">VOL</div>
                </div>

                {papers.map((p) => (
                  <Link
                    key={p.code}
                    to="/question-sets/$slug"
                    params={{ slug: "kpsc-ae-2025-civil" }}
                    className="group grid grid-cols-1 md:grid-cols-10 p-4 border-b border-slate-900/50 hover:bg-slate-900/40 transition-colors"
                  >
                    <div className="col-span-2 font-mono text-xs text-slate-500 group-hover:text-white transition-colors mb-2 md:mb-0">
                      {p.year}
                    </div>
                    <div className="col-span-4 text-slate-300 group-hover:text-white transition-colors font-light mb-2 md:mb-0">
                      {p.title}
                    </div>
                    <div className="col-span-3 font-mono text-xs text-slate-600">
                      {p.code}
                    </div>
                    <div className="col-span-1 font-mono text-[10px] md:text-right text-slate-500 mt-2 md:mt-0">
                      {p.questions} Qs
                    </div>
                  </Link>
                ))}
              </div>
            </section>

          </div>

          {/* Analytical Sidebar */}
          <aside className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-900 pt-12 lg:pt-0 lg:pl-12">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-8 pb-2 border-b border-slate-900">
              Exam Summary
            </h3>
            <div className="space-y-6">
              {[
                { label: "Total Questions", value: "2,400" },
                { label: "Temporal Index", value: "2018–2025" },
                { label: "Subject Nodes", value: "12" },
                { label: "Accuracy Rate", value: "99.4%" },
              ].map(({ label, value }) => (
                <div key={label} className="border-b border-slate-900/50 pb-4">
                  <div className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-1">{label}</div>
                  <div className="text-xl text-slate-200 font-light">{value}</div>
                </div>
              ))}
            </div>
            
            <div className="mt-16 font-mono text-[10px] text-slate-600 uppercase tracking-widest leading-loose">
              / INDEXED AT: 2026-09-01
              <br/>/ STATUS: ACTIVE
              <br/>/ PRIORITY: HIGH
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

