import React, { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SearchCommandModal } from "../components/search/SearchCommandModal";
import { authClient } from "../../lib/auth-client";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../lib/orpc";
import { Search, ArrowRight, Layers, AlertCircle, Award, Sparkles } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Prepora — Live Knowledge Index" },
      {
        name: "description",
        content: "A premium digital reference library for exam preparation.",
      },
      { property: "og:title", content: "Prepora — Live Knowledge Index" },
      {
        property: "og:description",
        content: "Discover and analyze verified exam question sets directly from the live database.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const navigate = useNavigate();

  const { data: session } = authClient.useSession();
  const { data: dbExams, isLoading } = useQuery(
    orpc.exams.list.queryOptions({ input: { limit: 100 } })
  );

  const realExams = dbExams || [];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate({ to: "/search", search: { q: searchQuery } as any });
    }
  };

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 selection:bg-slate-700 selection:text-white font-sans">
      <SearchCommandModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />

      <main className="max-w-[1400px] mx-auto px-6 pt-24 pb-32">
        {/* HERO / ASYMMETRIC SEARCH */}
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-24">
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
                  placeholder="Search exam, code, or topic..."
                  className="w-full bg-transparent outline-none text-2xl md:text-4xl font-light text-white placeholder-slate-800 tracking-tight"
                  autoFocus
                />
                <button
                  type="submit"
                  className="hidden md:block font-mono text-xs text-slate-400 hover:text-white transition-colors uppercase tracking-widest shrink-0"
                >
                  [ Execute ]
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* EXAM CATEGORIES */}
        <section className="mb-32">
          <div className="border-b border-slate-900 pb-4 mb-8 flex justify-between items-end">
            <h2 className="text-sm font-mono tracking-widest text-slate-400 uppercase">
              // Exam Categories
            </h2>
            <span className="text-xs font-mono text-slate-600 uppercase tracking-widest">
              COLLECTIVE INDEX
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Certification Exams */}
            <Link
              to="/exams"
              search={{ category: "certification" }}
              className="group p-8 bg-[#06080a] border border-slate-900 hover:border-sky-500/50 hover:bg-slate-900/30 transition-all flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <span className="font-mono text-[10px] text-sky-400 uppercase tracking-widest block mb-2">
                  01 / CERTIFICATIONS
                </span>
                <h3 className="text-2xl text-white font-light group-hover:text-sky-300 transition-colors">
                  Certification Exams
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-2">
                  Microsoft Learn, Azure, AI & Enterprise Solutions
                </p>
              </div>
              <div className="font-mono text-xs text-slate-600 group-hover:text-sky-400 transition-colors flex items-center gap-2 mt-6">
                <span>EXPLORE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            {/* Government Exams */}
            <Link
              to="/exams"
              search={{ category: "government" }}
              className="group p-8 bg-[#06080a] border border-slate-900 hover:border-slate-700 hover:bg-slate-900/30 transition-all flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-2">
                  02 / PUBLIC SERVICE
                </span>
                <h3 className="text-2xl text-white font-light group-hover:text-slate-200 transition-colors">
                  Government Exams
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-2">
                  State PSC, SSC & Public Sector Recruitment
                </p>
              </div>
              <div className="font-mono text-xs text-slate-600 group-hover:text-slate-300 transition-colors flex items-center gap-2 mt-6">
                <span>EXPLORE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            {/* Competitive Exams */}
            <Link
              to="/exams"
              search={{ category: "competitive" }}
              className="group p-8 bg-[#06080a] border border-slate-900 hover:border-slate-700 hover:bg-slate-900/30 transition-all flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-2">
                  03 / TECHNICAL
                </span>
                <h3 className="text-2xl text-white font-light group-hover:text-slate-200 transition-colors">
                  Competitive Exams
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-2">
                  GATE, Assistant Engineer & Technical Papers
                </p>
              </div>
              <div className="font-mono text-xs text-slate-600 group-hover:text-slate-300 transition-colors flex items-center gap-2 mt-6">
                <span>EXPLORE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>

            {/* University Exams */}
            <Link
              to="/exams"
              search={{ category: "university" }}
              className="group p-8 bg-[#06080a] border border-slate-900 hover:border-slate-700 hover:bg-slate-900/30 transition-all flex flex-col justify-between min-h-[180px]"
            >
              <div>
                <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-2">
                  04 / ACADEMIC
                </span>
                <h3 className="text-2xl text-white font-light group-hover:text-slate-200 transition-colors">
                  University Exams
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-2">
                  Semester, Degree & Academic Question Banks
                </p>
              </div>
              <div className="font-mono text-xs text-slate-600 group-hover:text-slate-300 transition-colors flex items-center gap-2 mt-6">
                <span>EXPLORE</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          </div>
        </section>

        {/* LIVE DATABASE EXAM CATALOGUE */}
        <section className="mb-32">
          <div className="flex justify-between items-end border-b border-slate-900 pb-4 mb-8">
            <div>
              <h2 className="text-sm font-mono tracking-widest text-slate-400 uppercase flex items-center gap-2">
                Published Exam Sets
                {isLoading ? (
                  <span className="px-3 py-0.5 bg-slate-900 border border-slate-800 text-slate-500 font-mono text-xs rounded-full animate-pulse">
                    LOADING...
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-sky-400 font-mono text-xs rounded-full">
                    {realExams.length} Available
                  </span>
                )}
              </h2>
            </div>
            {realExams.length > 0 && (
              <Link
                to="/exams"
                className="text-xs font-mono text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
              >
                Explore Directory →
              </Link>
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-col border-t border-slate-900 divide-y divide-slate-900/60">
              {[1, 2, 3].map((n) => (
                <div key={n} className="py-6 px-4 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-pulse">
                  <div className="flex items-center gap-6 flex-1">
                    <div className="h-4 w-6 bg-slate-900 rounded" />
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-3">
                        <div className="h-6 w-72 bg-slate-900/90 rounded" />
                        <div className="h-5 w-20 bg-slate-900/60 rounded" />
                      </div>
                      <div className="h-3 w-44 bg-slate-900/40 rounded" />
                    </div>
                  </div>
                  <div className="h-4 w-24 bg-slate-900/60 rounded shrink-0" />
                </div>
              ))}
            </div>
          ) : realExams.length > 0 ? (
            <div className="flex flex-col border-t border-slate-900">
              {realExams.map((exam: any, idx: number) => (
                <Link
                  key={exam.id || exam.slug || idx}
                  to="/exams/$examSlug"
                  params={{ examSlug: exam.slug }}
                  className="group py-6 border-b border-slate-900/60 hover:bg-slate-900/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 px-4"
                >
                  <div className="flex items-center gap-6">
                    <span className="font-mono text-xs text-slate-600 group-hover:text-slate-400 w-8">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl text-slate-200 group-hover:text-white font-light transition-colors">
                          {exam.name || exam.title}
                        </h3>
                        <span className="font-mono text-[10px] text-sky-400 border border-sky-900/60 bg-sky-950/40 px-2 py-0.5 uppercase tracking-widest">
                          {exam.code || "MS-EXAM"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono">
                        {exam.organization || exam.org || "Microsoft Learn"} · {exam.category || "CERTIFICATION"}
                      </p>
                    </div>
                  </div>

                  <div className="font-mono text-xs text-slate-600 group-hover:text-sky-400 transition-colors flex items-center gap-2">
                    <span>ACCESS HUB</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 px-6 text-center border border-slate-900/60 bg-slate-950/40 flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-slate-900/80 border border-slate-800/80 flex items-center justify-center mb-4 text-slate-600">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-mono text-slate-400 uppercase tracking-[0.2em] mb-2">
                CATALOG ARCHIVE STANDBY
              </h3>
              <p className="text-[11px] font-mono text-slate-600 max-w-sm leading-relaxed mb-6">
                No active exam sets indexed at this moment. Published sets will appear here automatically.
              </p>
              {session?.user && (
                <div className="flex items-center gap-3">
                  <Link
                    to="/admin/scraping"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-[10px] uppercase tracking-wider transition-colors flex items-center gap-2"
                  >
                    <Layers className="w-3 h-3 text-sky-400" />
                    Admin Scraping Control
                  </Link>
                </div>
              )}
            </div>
          )}
        </section>

        {/* CONTRIBUTION CALLOUT */}
        <section className="pt-16 border-t border-slate-900">
          <div className="max-w-xl">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8">
              Help Expand the Live Archive
            </h2>
            <p className="text-lg text-slate-300 mb-6">
              Have an official question paper or certification set that isn't indexed yet?
            </p>
            <Link
              to="/contribute"
              className="inline-block text-slate-400 hover:text-white border-b border-slate-700 hover:border-slate-400 pb-1 transition-all mb-4"
            >
              Contribute a question set →
            </Link>
            <p className="text-xs text-slate-600 font-mono">
              Every submission is validated and indexed directly into the database queue.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
