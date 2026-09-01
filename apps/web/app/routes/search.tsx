import React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

const searchSchema = z.object({
  q: z.string().optional().default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Search — Prepora" },
      { name: "description", content: "Search exams, questions, subjects, and topics on Prepora." },
      { property: "og:title", content: "Search — Prepora" },
      { property: "og:description", content: "Search real previous year questions, exams, subjects, and specific topics on Prepora's knowledge index." },
    ],
  }),
  component: SearchPage,
});

// Demo results
const demoResults = {
  questions: [
    { id: "01", slug: "q1", text: "What is the unit of modulus of elasticity?", exam: "Kerala PSC AE", year: 2025, subject: "Civil Engineering" },
    { id: "02", slug: "q2", text: "How does Azure RBAC work?", exam: "Microsoft AZ-104", year: 2024, subject: "Identity & Access" },
  ],
  topics: [{ id: "01", slug: "strength-of-materials", name: "Strength of Materials" }],
  exams: [{ id: "01", slug: "kerala-psc", name: "Kerala PSC" }],
};

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const query = fd.get("q") as string;
    if (query.trim()) {
      navigate({ to: "/search", search: { q: query } as any });
    }
  };

  const hasQuery = q.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      
      {/* Header / Nav */}
      <header className="px-6 py-8 flex justify-between items-center max-w-[1000px] mx-auto">
        <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors cursor-pointer">
          ← BACK
        </Link>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 pt-12">
        {/* Search Input - Command Surface */}
        <div className="mb-24">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-slate-700"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-slate-700"></div>
            <input
              name="q"
              type="text"
              defaultValue={q}
              placeholder="Search Prepora..."
              className="w-full bg-transparent border border-slate-900 outline-none text-3xl md:text-5xl lg:text-6xl p-6 md:p-8 text-white placeholder-slate-800 transition-colors rounded-none font-light tracking-tight"
              autoFocus
            />
          </form>
        </div>

        {!hasQuery ? (
          <div className="max-w-md">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8">Recent</h2>
            <div className="flex flex-col border-t border-slate-900">
              {["Exams", "Questions", "Topics", "Question Sets"].map((term) => (
                <div key={term} className="py-4 border-b border-slate-900 text-slate-400 hover:text-white cursor-pointer transition-colors">
                  {term}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-24">
            
            {/* Meta info about results */}
            <div className="border-b border-slate-800 pb-8">
              <h1 className="text-3xl text-white font-light tracking-tight mb-4">
                Search results for "{q}"
              </h1>
              <p className="font-mono text-xs text-slate-500 tracking-wider">
                {demoResults.questions.length} QUESTIONS · {demoResults.exams.length} EXAMS · {demoResults.topics.length} TOPICS
              </p>
            </div>

            {/* QUESTIONS */}
            <section>
              <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-12">Questions</h2>
              <div className="flex flex-col">
                {demoResults.questions.map((q) => (
                  <div key={q.slug} className="group pb-12 mb-12 border-b border-slate-900/50 block">
                    <span className="block font-mono text-xs text-slate-600 mb-6">{q.id}</span>
                    <h3 className="text-2xl text-slate-200 font-light mb-8 max-w-2xl leading-snug">
                      {q.text}
                    </h3>
                    <div className="flex flex-col gap-1 font-mono text-xs text-slate-500">
                      <span>{q.exam}</span>
                      <span>{q.subject}</span>
                      <span>{q.year}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* EXAMS & TOPICS in asymmetric split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-8">
              
              <section>
                <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8 border-b border-slate-900 pb-4">Exams</h2>
                <div className="flex flex-col">
                  {demoResults.exams.map((e) => (
                    <Link
                      key={e.slug}
                      to="/exams/$examSlug"
                      params={{ examSlug: e.slug }}
                      className="py-4 border-b border-slate-900/40 text-slate-300 hover:text-white flex gap-4 transition-colors"
                    >
                      <span className="font-mono text-xs text-slate-700">{e.id}</span>
                      <span>{e.name}</span>
                    </Link>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8 border-b border-slate-900 pb-4">Topics</h2>
                <div className="flex flex-col">
                  {demoResults.topics.map((t) => (
                    <Link
                      key={t.slug}
                      to="/topics/$topicSlug"
                      params={{ topicSlug: t.slug }}
                      className="py-4 border-b border-slate-900/40 text-slate-300 hover:text-white flex gap-4 transition-colors"
                    >
                      <span className="font-mono text-xs text-slate-700">{t.id}</span>
                      <span>{t.name}</span>
                    </Link>
                  ))}
                </div>
              </section>

            </div>

          </div>
        )}
      </main>
    </div>
  );
}
