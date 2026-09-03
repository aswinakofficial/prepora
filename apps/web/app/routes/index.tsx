import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SearchCommandModal } from "../components/search/SearchCommandModal";
import { authClient } from "../../lib/auth-client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prepora — Knowledge Index" },
      {
        name: "description",
        content: "A premium digital reference library for exam preparation.",
      },
      { property: "og:title", content: "Prepora — Knowledge Index" },
      { property: "og:description", content: "A premium digital reference library for exam preparation. Discover and analyze thousands of official questions." },
    ],
  }),
  component: HomePage,
});

// ─── Content Data ─────────────────────────────────────────────────────────────

const RECENTLY_ADDED = [
  {
    id: "01",
    slug: "azure-az-104-2026",
    title: "Microsoft Azure Administrator",
    meta: "AZ-104 · 2026 · 60 questions",
    freshness: "Added 2 hours ago",
  },
  {
    id: "02",
    slug: "istqb-ctfl-2026",
    title: "ISTQB Foundation",
    meta: "CTFL · 2026 · 40 questions",
    freshness: "Added yesterday",
  },
  {
    id: "03",
    slug: "kpsc-ae-2025-civil",
    title: "Kerala PSC Assistant Engineer",
    meta: "Civil Engineering · 2025 · 100 questions",
    freshness: "Added 2 days ago",
  },
];

const TRENDING_TOPICS = [
  { id: "01", name: "Identity & Access" },
  { id: "02", name: "Structural Engineering" },
  { id: "03", name: "Test Design" },
  { id: "04", name: "Organic Chemistry" },
];

const EXAM_INDEX = [
  {
    category: "CERTIFICATION",
    groups: [
      {
        name: "MICROSOFT",
        exams: [
          { name: "Azure Administrator", count: "120 questions", slug: "azure-az-104" },
          { name: "Azure Developer", count: "86 questions", slug: "azure-az-204" },
          { name: "Azure Fundamentals", count: "104 questions", slug: "azure-az-900" },
        ],
      },
      {
        name: "ISTQB",
        exams: [
          { name: "Foundation Level", count: "240 questions", slug: "istqb-ctfl" },
          { name: "Advanced Level", count: "90 questions", slug: "istqb-ctal" },
        ],
      },
    ],
  },
];

function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  const { data: session } = authClient.useSession();
  if (session) {
    console.log("✅ SUCCESSFUL LOGIN DETECTED. Session data:", session);
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate({ to: "/search", search: { q: searchQuery } as any });
    }
  };

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 selection:bg-slate-700 selection:text-white font-sans">
      <SearchCommandModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      {/* Reimagined Editorial Header */}
      <header className="border-b border-slate-900/80 mb-24">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-12 text-xs font-mono tracking-widest uppercase">
          
          {/* Brand Col */}
          <div className="col-span-1 md:col-span-3 border-b md:border-b-0 md:border-r border-slate-900/50 p-6 flex flex-col justify-center">
            <div className="text-white font-bold tracking-[0.3em]">PREPORA</div>
          </div>
          
          {/* Main Nav Col */}
          <div className="col-span-1 md:col-span-6 p-6 flex items-center gap-8 md:gap-12 overflow-x-auto border-b md:border-b-0 md:border-r border-slate-900/50">
            <Link to="/exams" className="text-slate-500 hover:text-white transition-colors">Exams</Link>
            <Link to="/subjects" className="text-slate-500 hover:text-white transition-colors">Subjects</Link>
            <Link to="/practice" className="text-slate-500 hover:text-white transition-colors">Practice</Link>
            <Link to="/contribute" className="text-slate-500 hover:text-white transition-colors">Contribute</Link>
          </div>

          {/* Action Col */}
          <div className="col-span-1 md:col-span-3 p-6 flex items-center justify-between md:justify-end gap-6">
            {session ? (
              <button
                onClick={async () => await authClient.signOut()}
                className="text-slate-500 hover:text-white transition-colors shrink-0 font-mono uppercase tracking-widest text-xs"
              >
                Sign out
              </button>
            ) : (
              <Link to={"/auth/signin" as any} className="text-slate-500 hover:text-white transition-colors shrink-0">
                Sign In
              </Link>
            )}
            <button
              onClick={() => setModalOpen(true)}
              className="text-slate-500 hover:text-white transition-colors flex items-center gap-2 shrink-0 group"
            >
              Scan <kbd className="text-[9px] px-1.5 py-0.5 border border-slate-800 text-slate-600 group-hover:border-slate-500 transition-colors">⌘K</kbd>
            </button>
          </div>

        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 pt-24 pb-32">
        
        {/* HERO / ASYMMETRIC SEARCH */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-40">
          {/* Left spacer column for extreme asymmetry */}
          <div className="hidden md:block col-span-2 lg:col-span-3 border-l border-slate-900/50 pl-6 h-full"></div>
          
          <div className="col-span-1 md:col-span-10 lg:col-span-9">
            <h1 className="text-5xl md:text-7xl lg:text-8xl text-white font-normal tracking-tighter mb-16 leading-[0.9] max-w-4xl selection:bg-white selection:text-black">
              PREPARE WITH<br />PRECISION.
            </h1>
            
            <form onSubmit={handleSearchSubmit} className="relative group max-w-3xl">
              <div className="flex flex-col md:flex-row md:items-end gap-4 border-b border-slate-600 focus-within:border-white transition-colors pb-4">
                <label className="font-mono text-xs text-slate-500 tracking-[0.2em] uppercase shrink-0">
                  Global Query 
                  <span className="hidden md:inline mx-4 text-slate-700">/</span>
                </label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Exam, subject, or context..."
                  className="w-full bg-transparent outline-none text-2xl md:text-4xl font-light text-white placeholder-slate-800 tracking-tight"
                  autoFocus
                />
                <button
                  type="submit"
                  className="hidden md:block font-mono text-xs text-slate-600 hover:text-white transition-colors uppercase tracking-widest shrink-0"
                >
                  [ Execute ]
                </button>
              </div>
              <button
                type="submit"
                className="md:hidden w-full text-left mt-4 font-mono text-xs text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
              >
                [ Execute Search ]
              </button>
            </form>
          </div>
        </section>

        {/* RECENTLY ADDED */}
        <section className="mb-32">
          <div className="flex justify-between items-end border-b border-slate-900 pb-4 mb-8">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase">Recently Added</h2>
            <Link to="/exams" className="text-sm font-mono text-slate-600 hover:text-slate-300 transition-colors uppercase tracking-wider">
              View all →
            </Link>
          </div>
          
          <div className="flex flex-col">
            {RECENTLY_ADDED.map((item) => (
              <Link
                key={item.slug}
                to="/question-sets/$slug"
                params={{ slug: item.slug }}
                className="group py-6 border-b border-slate-900/50 hover:border-slate-700 transition-colors flex flex-col md:flex-row md:items-baseline gap-4 md:gap-8"
              >
                <span className="font-mono text-sm text-slate-700 group-hover:text-slate-400 w-8">{item.id}</span>
                <div className="flex-1">
                  <h3 className="text-lg text-slate-200 group-hover:text-white transition-colors mb-1">{item.title}</h3>
                  <p className="text-sm text-slate-500 font-mono">{item.meta}</p>
                </div>
                <div className="text-xs font-mono text-slate-600 group-hover:text-slate-400">
                  {item.freshness}
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* GRID SECTION: TRENDING & EXAM INDEX */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-8">
          
          {/* TRENDING */}
          <section className="lg:col-span-4">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase border-b border-slate-900 pb-4 mb-8">Trending Topics</h2>
            <div className="flex flex-col">
              {TRENDING_TOPICS.map((topic) => (
                <Link
                  key={topic.id}
                  to="/search"
                  search={{ q: topic.name }}
                  className="group py-4 flex gap-6 border-b border-slate-900/40 hover:border-slate-700 transition-colors"
                >
                  <span className="font-mono text-sm text-slate-700 group-hover:text-slate-400">{topic.id}</span>
                  <span className="text-slate-300 group-hover:text-white transition-colors">{topic.name}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* EXAM INDEX */}
          <section className="lg:col-span-8 lg:pl-16">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase border-b border-slate-900 pb-4 mb-12">Explore</h2>
            
            <div className="font-mono text-xs text-slate-600 tracking-[0.2em] mb-12 flex gap-8">
              <span className="text-white border-b border-slate-700 pb-1 cursor-default">CERTIFICATION</span>
              <span className="hover:text-slate-400 transition-colors cursor-pointer border-b border-transparent">UNIVERSITY</span>
              <span className="hover:text-slate-400 transition-colors cursor-pointer border-b border-transparent">COMPETITIVE</span>
            </div>

            <div className="space-y-16">
              {EXAM_INDEX[0].groups.map((group) => (
                <div key={group.name}>
                  <h3 className="text-sm font-semibold tracking-wide text-slate-300 mb-6">{group.name}</h3>
                  <div className="flex flex-col space-y-4">
                    {group.exams.map((exam) => (
                      <Link
                        key={exam.slug}
                        to="/exams/$examSlug"
                        params={{ examSlug: exam.slug }}
                        className="group flex justify-between items-baseline hover:text-white"
                      >
                        <span className="text-slate-400 group-hover:text-white transition-colors">{exam.name}</span>
                        <span className="font-mono text-xs text-slate-600 group-hover:text-slate-400">{exam.count}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* CONTRIBUTION - EDITORIAL */}
        <section className="mt-32 pt-16 border-t border-slate-900">
          <div className="max-w-xl">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8">Help Expand the Archive</h2>
            <p className="text-lg text-slate-300 mb-6">Have a question paper that isn't here?</p>
            <Link to="/contribute" className="inline-block text-slate-400 hover:text-white border-b border-slate-700 hover:border-slate-400 pb-1 transition-all mb-4">
              Contribute a question set →
            </Link>
            <p className="text-xs text-slate-600 font-mono">Every submission is reviewed before publication.</p>
          </div>
        </section>

      </main>
    </div>
  );
}


