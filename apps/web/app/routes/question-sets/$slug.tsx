import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/question-sets/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — Question Set | Prepora` },
      { name: "description", content: `Browse all high-yield practice questions from this curated exam question set with verified step-by-step explanations.` },
    ],
  }),
  component: QuestionSetPage,
});

function QuestionSetPage() {
  const { slug } = Route.useParams();
  const title = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const questions = [
    { number: 1, text: "What is the SI unit of modulus of elasticity (Young's Modulus)?", slug: "unit-modulus-elasticity", topic: "Elasticity", difficulty: "Medium" },
    { number: 2, text: "What is the theoretical range of Poisson's ratio for isotropic materials?", slug: "poissons-ratio", topic: "Elasticity", difficulty: "Easy" },
    { number: 3, text: "Calculate the maximum bending moment for a simply supported beam with UDL w over length L.", slug: "max-bm-udl", topic: "Bending Moments", difficulty: "Medium" },
    { number: 4, text: "What is the characteristic compressive strength test duration for concrete cubes?", slug: "concrete-compressive-unit", topic: "Concrete Tech", difficulty: "Easy" },
    { number: 5, text: "Hooke's Law holds valid up to which characteristic point on the stress-strain curve?", slug: "hookes-law", topic: "Elasticity", difficulty: "Hard" },
  ];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center max-w-[1000px] mx-auto mb-16">
        <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
          ← BACK TO INDEX
        </Link>
      </header>

      <main className="max-w-[1000px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
          <span className="mx-4 text-slate-700">/</span>
          <span>SET</span>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">{slug}</span>
        </div>

        {/* Set Header - Typography Driven */}
        <div className="mb-24 flex flex-col md:flex-row md:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-xl">
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              {title}
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500">
              {questions.length} QUESTIONS <span className="mx-4 text-slate-700">|</span> ESTIMATED ~15 MIN
            </p>
          </div>

          <Link
            to="/practice"
            className="font-mono text-xs uppercase tracking-[0.2em] text-white border border-slate-600 px-6 py-4 hover:bg-white hover:text-black transition-colors shrink-0 text-center"
          >
            [ INITIATE SET ]
          </Link>
        </div>

        {/* Questions List Stream */}
        <div className="space-y-0 border-t-2 border-slate-900 border-b-2">
          {questions.map((q) => (
            <Link
              key={q.slug}
              to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
              params={{
                examSlug: "kerala-psc-ae-civil",
                variantSlug: "paper-1",
                year: "2025",
                subjectSlug: "strength-of-materials",
                questionSlug: q.slug,
              }}
              className="group flex flex-col md:flex-row md:items-center justify-between gap-4 py-8 border-b border-slate-900/50 hover:bg-slate-900/30 transition-colors px-4 -mx-4"
            >
              <div className="flex gap-6 items-baseline min-w-0">
                <span className="font-mono text-sm tracking-widest text-slate-600 group-hover:text-slate-300 transition-colors shrink-0 w-8">
                  {String(q.number).padStart(2, '0')}
                </span>
                <span className="text-lg text-slate-300 group-hover:text-white transition-colors truncate max-w-2xl font-light">
                  {q.text}
                </span>
              </div>
              <div className="flex items-center gap-6 shrink-0 pl-14 md:pl-0">
                <span className="text-xs font-mono text-slate-600">{q.topic.toUpperCase()}</span>
                <span className="text-xs font-mono text-slate-500 border border-slate-800 px-2 py-1">{q.difficulty.toUpperCase()}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

