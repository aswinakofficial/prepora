import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/exams/")({
  head: () => ({
    meta: [
      { title: "Exam Directory — Prepora" },
      { name: "description", content: "Explore official previous-year question repositories for Kerala PSC, GATE, SSC JE, Azure, ISTQB, and university exams." },
      { property: "og:title", content: "Exam Directory — Prepora" },
      { property: "og:description", content: "Explore official previous-year question repositories for global and local competitive exams, university papers, and strict certifications." },
    ],
  }),
  component: ExamsPage,
});

const ALL_EXAMS = [
  { slug: "kerala-psc", name: "Kerala PSC Assistant Engineer", org: "Kerala Public Service Commission", category: "State PSC", code: "AE Civil", count: 2400 },
  { slug: "azure-az-104", name: "Microsoft Azure Administrator", org: "Microsoft Certification", category: "Certification", code: "AZ-104", count: 1240 },
  { slug: "istqb-ctfl", name: "ISTQB Certified Tester Foundation", org: "ISTQB Board", category: "Certification", code: "CTFL 4.0", count: 890 },
  { slug: "gate", name: "GATE Civil & Computer Science", org: "IITs / IISc", category: "Engineering", code: "GATE 2025", count: 8000 },
  { slug: "ssc-je", name: "SSC Junior Engineer", org: "Staff Selection Commission", category: "Central Govt", code: "SSC JE", count: 3200 },
  { slug: "ktu-btech", name: "KTU B.Tech Semester Papers", org: "APJ Abdul Kalam Tech University", category: "University", code: "KTU BTech", count: 4100 },
];

const CATEGORIES = ["ALL", "CERTIFICATION", "STATE PSC", "ENGINEERING", "CENTRAL GOVT", "UNIVERSITY"];

function ExamsPage() {
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [filterQuery, setFilterQuery] = useState("");

  const filteredExams = ALL_EXAMS.filter((exam) => {
    const matchesCategory = selectedCategory === "ALL" || exam.category.toUpperCase() === selectedCategory;
    const matchesQuery =
      exam.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      exam.code.toLowerCase().includes(filterQuery.toLowerCase()) ||
      exam.org.toLowerCase().includes(filterQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
          ← BACK TO INDEX
        </Link>
      </header>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">EXAM DIRECTORY</span>
        </div>

        {/* Page Header */}
        <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              EXAMINATION HUBS
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase">
              Browse the global repository of examination nodes and structured contexts.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <label className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">Quick Filter</label>
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="SEARCH CATALOGUE..."
              className="bg-transparent border-b border-slate-600 text-white font-mono text-sm pb-2 outline-none focus:border-white transition-colors placeholder-slate-700 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Structural Filter Bar */}
        <div className="mb-12 border-b border-slate-900 pb-4 overflow-x-auto">
          <div className="flex items-center gap-8 font-mono text-xs tracking-widest text-slate-500 min-w-max">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`hover:text-white transition-colors ${
                  selectedCategory === cat ? "text-white border-b-2 border-slate-500 pb-1" : ""
                }`}
              >
                [{cat}]
              </button>
            ))}
          </div>
        </div>

        {/* Monolithic Index List */}
        <div className="border-t-2 border-slate-900 border-b-2">
          {/* Table Header (Hidden on small screens) */}
          <div className="hidden md:grid grid-cols-12 gap-6 p-4 border-b border-slate-900 font-mono text-[10px] text-slate-600 tracking-widest uppercase">
            <div className="col-span-2">NODE ID</div>
            <div className="col-span-4">EXAMINATION NAME</div>
            <div className="col-span-3">AUTHORITY</div>
            <div className="col-span-2">CATEGORY</div>
            <div className="col-span-1 text-right">VOL</div>
          </div>

          {filteredExams.length > 0 ? (
            filteredExams.map((exam) => (
              <Link
                key={exam.slug}
                to="/exams/$examSlug"
                params={{ examSlug: exam.slug }}
                className="group flex flex-col md:grid md:grid-cols-12 gap-4 md:gap-6 p-4 md:items-center border-b border-slate-900/50 hover:bg-slate-900/30 transition-colors"
              >
                <div className="col-span-2 font-mono text-xs text-slate-500 group-hover:text-white transition-colors">
                  {exam.code.toUpperCase()}
                </div>
                
                <div className="col-span-4 text-slate-300 group-hover:text-white transition-colors text-lg font-light truncate">
                  {exam.name}
                </div>

                <div className="col-span-3 font-mono text-[10px] text-slate-500 uppercase truncate">
                  {exam.org}
                </div>

                <div className="col-span-2">
                  <span className="font-mono text-[10px] text-slate-600 border border-slate-800 px-2 py-1 uppercase">
                    {exam.category}
                  </span>
                </div>

                <div className="col-span-1 md:text-right font-mono text-xs text-slate-500 mt-2 md:mt-0">
                  {exam.count}
                </div>
              </Link>
            ))
          ) : (
            <div className="font-mono text-xs text-slate-600 uppercase tracking-widest py-16 text-center">
              NO MATCHING NODES FOUND.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

