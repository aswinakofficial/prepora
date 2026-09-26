import { createFileRoute, Link } from "@tanstack/react-router";
import { breadcrumbListJsonLd, canonicalLink } from "../../../lib/json-ld";

export const Route = createFileRoute("/subjects/")({
  head: () => ({
    meta: [
      { title: "Subjects — Prepora" },
      {
        name: "description",
        content:
          "Browse exam questions by subject: Civil Engineering, Electronics, Computer Science, General Knowledge and more.",
      },
    ],
    links: [canonicalLink("/subjects")],
    scripts: [
      breadcrumbListJsonLd([
        { name: "Home", path: "/" },
        { name: "Subjects", path: "/subjects" },
      ]),
    ],
  }),
  component: SubjectsPage,
});

const subjects = [
  { slug: "civil-engineering", name: "Civil Engineering", icon: "🏗", count: 1200 },
  { slug: "mechanical-engineering", name: "Mechanical Engineering", icon: "⚙", count: 900 },
  { slug: "electrical-engineering", name: "Electrical Engineering", icon: "⚡", count: 800 },
  { slug: "computer-science", name: "Computer Science", icon: "💻", count: 3000 },
  { slug: "general-knowledge", name: "General Knowledge", icon: "🌍", count: 600 },
  { slug: "mathematics", name: "Mathematics", icon: "📐", count: 1500 },
];

function SubjectsPage() {
  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Back Context */}
      <div className="px-6 pt-4 md:pt-8 flex justify-between items-center max-w-[1200px] mx-auto mb-4 md:mb-6">
        <Link
          to="/"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO INDEX
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-8 md:mb-10 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">SUBJECT MATRIX</span>
        </div>

        {/* Page Header */}
        <div className="mb-10 md:mb-12 flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-slate-800 pb-8">
          <div className="max-w-2xl">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tighter text-white mb-6 leading-tight">
              SUBJECT MATRIX
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
              Global taxonomy of disciplines. Select a root node to traverse corresponding
              sub-topics and raw exam vectors.
            </p>
          </div>
        </div>

        {/* Structural Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-900 border-t-2 border-b-2 border-slate-900">
          {subjects.map((s, idx) => (
            <Link
              key={s.slug}
              to="/subjects/$subjectSlug"
              params={{ subjectSlug: s.slug }}
              className="bg-[#06080a] p-8 md:p-12 hover:bg-slate-900/30 transition-colors group flex flex-col border border-slate-900/50"
            >
              <div className="flex items-center justify-between mb-16">
                <span className="text-3xl opacity-80 mix-blend-luminosity grayscale group-hover:grayscale-0 transition-all duration-500">
                  {s.icon}
                </span>
                <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">
                  NODE {String(idx + 1).padStart(2, "0")}
                </span>
              </div>

              <div className="mt-auto">
                <h2 className="text-2xl text-slate-300 group-hover:text-white font-light tracking-tight mb-4 transition-colors">
                  {s.name}
                </h2>
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500 flex items-center gap-4">
                  <span>{s.count.toLocaleString()} VOL</span>
                  <span className="text-slate-800">/</span>
                  <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
                    ENTER →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
