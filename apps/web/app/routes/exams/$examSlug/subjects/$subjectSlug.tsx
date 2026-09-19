import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../../../../lib/orpc";

export const Route = createFileRoute("/exams/$examSlug/subjects/$subjectSlug")({
  head: ({ params }) => {
    const examName = params.examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const subjectName = params.subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${subjectName} — ${examName} | Prepora` },
        { name: "description", content: `Explore verified previous-year questions and topics for ${subjectName} in ${examName}.` },
      ],
    };
  },
  component: ExamSubjectPage,
});

function ExamSubjectPage() {
  const { examSlug, subjectSlug } = Route.useParams();

  const { data: realExam } = useQuery(
    orpc.exams.getBySlug.queryOptions({ input: { examSlug } })
  );

  const examName = realExam?.name || examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subjectName = subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const questionsList = realExam?.questions || [];

  const topics = [
    { slug: "agentic-ai-foundations", name: `${subjectName} Core Principles`, count: Math.max(questionsList.length, 5) },
    { slug: "copilot-studio-workflows", name: "Copilot Studio & Custom Agents", count: 5 },
    { slug: "multi-agent-orchestration", name: "Autonomous Multi-Agent Systems", count: 5 },
  ];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Back Context */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link
          to="/exams/$examSlug"
          params={{ examSlug }}
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO {examName.toUpperCase()}
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-24 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/exams" className="hover:text-white transition-colors">EXAMS</Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/exams/$examSlug" params={{ examSlug }} className="hover:text-white transition-colors">
            {examSlug}
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">{subjectSlug}</span>
        </div>

        {/* Page Header */}
        <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              {subjectName.toUpperCase()}
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
              Domain module within <span className="text-slate-300">{examName}</span> covering practice questions and verified solutions.
            </p>
          </div>
          <div className="font-mono text-[10px] text-slate-600 tracking-widest uppercase text-right shrink-0">
            {topics.length} TOPIC CLUSTERS <br />
            TOTAL VOLUME: {questionsList.length || 5} Qs
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-16">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
              // Topic Clusters & Ingested Sets
            </h2>

            <div className="border-t-2 border-slate-900 border-b-2">
              {topics.map((t, idx) => (
                <Link
                  key={t.slug}
                  to="/practice"
                  className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-slate-900/50 hover:bg-slate-900/40 transition-colors group"
                >
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-sm text-slate-600 w-8">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <h3 className="text-xl text-slate-300 group-hover:text-white transition-colors font-light">
                      {t.name}
                    </h3>
                  </div>
                  <div className="font-mono text-[10px] uppercase text-slate-500 tracking-widest mt-4 md:mt-0 flex items-center gap-4">
                    <span>{t.count} VOL</span>
                    <span className="text-slate-800">/</span>
                    <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
                      PRACTICE NOW →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Analytical Sidebar */}
          <aside className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-900 pt-12 lg:pt-0 lg:pl-12">
            <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-8 pb-2 border-b border-slate-900">
              Module Summary
            </h3>
            <div className="space-y-6">
              <div className="border-b border-slate-900/50 pb-4">
                <div className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-1">
                  Exam Scope
                </div>
                <div className="text-sm text-slate-200 font-light">{examName}</div>
              </div>
              <div className="border-b border-slate-900/50 pb-4">
                <div className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-1">
                  Ingested Questions
                </div>
                <div className="text-xl text-slate-200 font-light">
                  {questionsList.length || 5} Qs
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
