import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Award,
  BarChart2,
  BookOpen,
  CheckCircle2,
  Search,
  Sparkles,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/topics/$topicSlug")({
  head: ({ params }) => {
    const name = params.topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Topic Knowledge Index | Prepora` },
        {
          name: "description",
          content: `Master ${name} with previous-year exam questions, verified step-by-step explanations, key formulas, and topic analytics.`,
        },
        { property: "og:title", content: `${name} — Exam Questions & Formula Index | Prepora` },
      ],
    };
  },
  component: TopicPage,
});

// ─── Data Types & Initial Mock Questions ──────────────────────────────────────

interface QuestionItem {
  id: string;
  code: string;
  slug: string;
  text: string;
  exam: string;
  year: number;
  difficulty: "Easy" | "Medium" | "Hard";
  formulaRef?: string;
  examSlug: string;
  variantSlug: string;
  subjectSlug: string;
}

const SOM_QUESTIONS: QuestionItem[] = [
  {
    id: "q-01",
    code: "SOM-2025-001",
    slug: "unit-modulus-elasticity",
    text: "What is the SI unit of modulus of elasticity (Young's Modulus)?",
    exam: "Kerala PSC AE Civil",
    year: 2025,
    difficulty: "Easy",
    formulaRef: "E = σ / ε",
    examSlug: "kerala-psc-ae-civil",
    variantSlug: "paper-1",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-02",
    code: "SOM-2024-002",
    slug: "poissons-ratio-isotropic",
    text: "The ratio of lateral strain to linear axial strain within the elastic limit for isotropic materials is defined as:",
    exam: "SSC JE Civil",
    year: 2024,
    difficulty: "Easy",
    formulaRef: "ν = -ε_lateral / ε_axial",
    examSlug: "ssc-je-civil",
    variantSlug: "morning-shift",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-03",
    code: "SOM-2024-003",
    slug: "max-bending-moment-udl",
    text: "Maximum bending moment for a simply supported beam of span L carrying a uniform distributed load w throughout is:",
    exam: "Kerala PSC AE Civil",
    year: 2024,
    difficulty: "Medium",
    formulaRef: "M_max = (w · L²) / 8",
    examSlug: "kerala-psc-ae-civil",
    variantSlug: "paper-1",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-04",
    code: "SOM-2024-004",
    slug: "hookes-law-proportional-limit",
    text: "Hooke's Law of linear elasticity holds strictly valid up to which characteristic point on the stress-strain curve?",
    exam: "GATE Civil",
    year: 2024,
    difficulty: "Hard",
    formulaRef: "σ ∝ ε (Proportional Limit)",
    examSlug: "gate-civil",
    variantSlug: "session-2",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-05",
    code: "SOM-2023-005",
    slug: "max-shear-stress-rectangular-beam",
    text: "The ratio of maximum shear stress (τ_max) to average shear stress (τ_avg) for a rectangular beam cross-section under flexure is:",
    exam: "Kerala PSC AE Civil",
    year: 2023,
    difficulty: "Medium",
    formulaRef: "τ_max = 1.5 · τ_avg",
    examSlug: "kerala-psc-ae-civil",
    variantSlug: "paper-1",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-06",
    code: "SOM-2023-006",
    slug: "principal-plane-shear-orientation",
    text: "What is the principal angle of orientation for planes of maximum shear stress relative to principal stress planes?",
    exam: "SSC JE Civil",
    year: 2023,
    difficulty: "Hard",
    formulaRef: "θ_s = θ_p ± 45°",
    examSlug: "ssc-je-civil",
    variantSlug: "afternoon-shift",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-07",
    code: "SOM-2023-007",
    slug: "torsion-strain-energy-shaft",
    text: "The strain energy U stored in a solid circular shaft of length L and polar moment of inertia J subjected to torque T is:",
    exam: "GATE Civil",
    year: 2023,
    difficulty: "Hard",
    formulaRef: "U = (T² · L) / (2 · G · J)",
    examSlug: "gate-civil",
    variantSlug: "session-1",
    subjectSlug: "civil-engineering",
  },
  {
    id: "q-08",
    code: "SOM-2024-008",
    slug: "eulers-critical-load-both-fixed",
    text: "Euler's critical crippling load P_cr for a column fixed at both ends with actual length L is given by:",
    exam: "RRB JE Civil",
    year: 2024,
    difficulty: "Medium",
    formulaRef: "P_cr = (4π² · E · I) / L²",
    examSlug: "rrb-je-civil",
    variantSlug: "paper-1",
    subjectSlug: "civil-engineering",
  },
];

const TOPIC_FORMULAS = [
  { name: "Hooke's Law", formula: "σ = E · ε", note: "Valid up to Proportional Limit" },
  { name: "Flexure Formula", formula: "M / I = σ / y = E / R", note: "Pure bending condition" },
  {
    name: "Torsion Equation",
    formula: "T / J = τ / r = G · θ / L",
    note: "Circular cross sections",
  },
  {
    name: "Elongation of Tapered Bar",
    formula: "δ = (4 · P · L) / (π · E · d₁ · d₂)",
    note: "Axial force P",
  },
  {
    name: "Mohr's Circle Radius",
    formula: "R = √[((σ_x - σ_y)/2)² + τ_xy²]",
    note: "Max shear stress τ_max",
  },
];

const EXAM_DISTRIBUTION = [
  { name: "Kerala PSC AE", percentage: 42, color: "bg-blue-500" },
  { name: "SSC JE Civil", percentage: 35, color: "bg-emerald-500" },
  { name: "GATE Civil", percentage: 23, color: "bg-amber-500" },
];

function TopicPage() {
  const { topicSlug } = Route.useParams();
  const name = topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("ALL");
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Filter questions based on controls
  const filteredQuestions = useMemo(() => {
    return SOM_QUESTIONS.filter((q) => {
      const matchDiff =
        selectedDifficulty === "ALL" || q.difficulty.toUpperCase() === selectedDifficulty;
      const matchExam =
        selectedExam === "ALL" || q.exam.toUpperCase().includes(selectedExam.toUpperCase());
      const matchSearch =
        searchQuery.trim() === "" ||
        q.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.exam.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDiff && matchExam && matchSearch;
    });
  }, [selectedDifficulty, selectedExam, searchQuery]);

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Navigation & Context Action Header */}
      <div className="px-6 pt-10 flex justify-between items-center max-w-[1300px] mx-auto mb-12">
        <Link
          to="/subjects"
          className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-2"
        >
          ← BACK TO SUBJECTS MATRIX
        </Link>
        <Link
          to="/practice"
          className="font-mono text-xs uppercase tracking-widest text-slate-400 hover:text-white border border-slate-800 hover:border-slate-500 px-4 py-2 transition-all flex items-center gap-2"
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>PRACTICE MODE</span>
        </Link>
      </div>

      <main className="max-w-[1300px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-16 border-b border-slate-900 pb-4 flex items-center flex-wrap gap-y-2">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/subjects" className="hover:text-white transition-colors">
            SUBJECTS
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link
            to="/subjects/$subjectSlug"
            params={{ subjectSlug: "civil-engineering" }}
            className="hover:text-white transition-colors"
          >
            CIVIL ENGINEERING
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-white">{name.toUpperCase()}</span>
        </div>

        {/* Editorial Page Header */}
        <div className="mb-16 border-b border-slate-800 pb-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div className="max-w-4xl">
              <div className="font-mono text-xs tracking-[0.3em] text-blue-400 uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span>CORE ENGINE TAXONOMY</span>
              </div>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-normal tracking-tighter text-white uppercase mb-6 leading-tight">
                {name}
              </h1>
              <p className="font-mono text-xs tracking-widest text-slate-400 uppercase leading-relaxed max-w-2xl">
                Structural stress-strain relations, elastic constants, flexural and torsional
                mechanics, and principal stress analysis.
              </p>
            </div>

            <div className="font-mono text-xs text-slate-500 tracking-widest uppercase text-left lg:text-right shrink-0 border-l lg:border-l-0 lg:border-r border-slate-900 pl-4 lg:pl-0 lg:pr-6 py-2">
              <div className="text-white text-lg font-light mb-1">
                {SOM_QUESTIONS.length} VERIFIED QUESTIONS
              </div>
              <div className="text-slate-500">28 FORMULA CARDS · 8 EXAM SOURCES</div>
            </div>
          </div>
        </div>

        {/* Telemetry / Stat Cards Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-16">
          <div className="p-5 border border-slate-900 bg-slate-950/40 rounded-none">
            <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-2 flex items-center justify-between">
              <span>TOTAL VOLUME</span>
              <BookOpen className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-2xl text-white font-light tracking-tight">
              {SOM_QUESTIONS.length} Qs
            </div>
            <div className="font-mono text-[10px] text-emerald-400 mt-2 tracking-wider">
              +12 Added this paper
            </div>
          </div>

          <div className="p-5 border border-slate-900 bg-slate-950/40 rounded-none">
            <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-2 flex items-center justify-between">
              <span>TOPIC WEIGHTAGE</span>
              <Award className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-2xl text-amber-400 font-light tracking-tight">HIGH (18%)</div>
            <div className="font-mono text-[10px] text-slate-500 mt-2 tracking-wider">
              Top yield in Civil Papers
            </div>
          </div>

          <div className="p-5 border border-slate-900 bg-slate-950/40 rounded-none">
            <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-2 flex items-center justify-between">
              <span>FORMULA CARDS</span>
              <Sparkles className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-2xl text-white font-light tracking-tight">
              {TOPIC_FORMULAS.length} Key
            </div>
            <div className="font-mono text-[10px] text-blue-400 mt-2 tracking-wider">
              Annotated equations
            </div>
          </div>

          <div className="p-5 border border-slate-900 bg-slate-950/40 rounded-none">
            <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-2 flex items-center justify-between">
              <span>VERIFIED ACCURACY</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-2xl text-emerald-400 font-light tracking-tight">100%</div>
            <div className="font-mono text-[10px] text-slate-500 mt-2 tracking-wider">
              Peer-reviewed solutions
            </div>
          </div>
        </section>

        {/* Main Content Layout (Left Question Stream, Right Analytical Sidebar) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Left Column (Main Questions Stream) */}
          <div className="lg:col-span-8">
            {/* Filter & Controls Matrix */}
            <div className="mb-10 space-y-6 border-b border-slate-900 pb-8">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by question text, code, or exam..."
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-slate-500 outline-none text-sm text-slate-200 placeholder-slate-600 pl-11 pr-4 py-3 font-mono transition-colors"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Difficulty Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mr-2">
                    DIFFICULTY:
                  </span>
                  {["ALL", "EASY", "MEDIUM", "HARD"].map((diff) => (
                    <button
                      type="button"
                      key={diff}
                      onClick={() => setSelectedDifficulty(diff)}
                      className={`font-mono text-[11px] uppercase tracking-wider px-3 py-1 border transition-colors ${
                        selectedDifficulty === diff
                          ? "bg-slate-200 text-black border-slate-200 font-semibold"
                          : "bg-transparent text-slate-500 border-slate-900 hover:border-slate-700 hover:text-slate-300"
                      }`}
                    >
                      {diff}
                    </button>
                  ))}
                </div>

                {/* Exam Filter */}
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                    EXAM:
                  </span>
                  <select
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    className="bg-slate-950 border border-slate-800 text-slate-400 font-mono text-[11px] uppercase px-3 py-1 outline-none focus:border-slate-600 transition-colors"
                  >
                    <option value="ALL">ALL EXAMS</option>
                    <option value="KERALA PSC">KERALA PSC AE</option>
                    <option value="SSC JE">SSC JE</option>
                    <option value="GATE">GATE</option>
                    <option value="RRB JE">RRB JE</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Questions Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                {/* Question Archive ( */}
                {filteredQuestions.length})
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Showing {filteredQuestions.length} of {SOM_QUESTIONS.length} entries
              </span>
            </div>

            {/* Questions Stream */}
            <div className="border-t-2 border-slate-900 border-b-2 divide-y divide-slate-900/60">
              {filteredQuestions.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-mono text-sm text-slate-500 mb-2">
                    No matching questions found.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDifficulty("ALL");
                      setSelectedExam("ALL");
                      setSearchQuery("");
                    }}
                    className="font-mono text-xs text-blue-400 hover:underline uppercase tracking-wider"
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                filteredQuestions.map((q, _idx) => (
                  <Link
                    key={q.id}
                    to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                    params={{
                      examSlug: q.examSlug,
                      variantSlug: q.variantSlug,
                      year: String(q.year),
                      subjectSlug: q.subjectSlug,
                      questionSlug: q.slug,
                    }}
                    className="group block p-6 hover:bg-slate-900/40 transition-colors"
                  >
                    {/* Top Row: Code, Exam Tag, Year, Difficulty */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-slate-600 group-hover:text-slate-400 transition-colors">
                          {q.code}
                        </span>
                        <span className="text-slate-800">/</span>
                        <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border border-slate-800 text-slate-400">
                          {q.exam}
                        </span>
                        <span className="font-mono text-[10px] text-slate-600">{q.year}</span>
                      </div>

                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                          q.difficulty === "Easy"
                            ? "border-emerald-900/60 text-emerald-400 bg-emerald-950/20"
                            : q.difficulty === "Medium"
                              ? "border-blue-900/60 text-blue-400 bg-blue-950/20"
                              : "border-amber-900/60 text-amber-400 bg-amber-950/20"
                        }`}
                      >
                        {q.difficulty}
                      </span>
                    </div>

                    {/* Question Content */}
                    <h3 className="text-lg text-slate-200 group-hover:text-white font-light tracking-tight mb-4 leading-relaxed transition-colors">
                      {q.text}
                    </h3>

                    {/* Footer Row: Formula Badge & Action Link */}
                    <div className="flex items-center justify-between text-xs font-mono">
                      {q.formulaRef ? (
                        <div className="flex items-center gap-2 text-slate-500 bg-slate-950/60 border border-slate-900 px-2.5 py-1">
                          <span className="text-slate-600">FORMULA:</span>
                          <span className="text-slate-400">{q.formulaRef}</span>
                        </div>
                      ) : (
                        <div></div>
                      )}

                      <div className="flex items-center gap-1 text-slate-500 group-hover:text-white transition-colors tracking-widest uppercase text-[11px] ml-auto">
                        <span>ACCESS QUESTION</span>
                        <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Right Column (Analytical Sidebar) */}
          <aside className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-slate-900 pt-12 lg:pt-0 lg:pl-12 space-y-12">
            {/* PRACTICE CTA CARD */}
            <div className="p-6 border border-slate-800 bg-slate-950/90 relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-blue-500/10 rounded-full blur-xl pointer-events-none"></div>

              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-blue-400 mb-3 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5" />
                <span>INTERACTIVE ENGINE</span>
              </div>

              <h3 className="text-xl text-white font-normal mb-3">Initiate Practice Mode</h3>
              <p className="text-xs text-slate-400 leading-relaxed font-mono mb-6">
                Attempt all {SOM_QUESTIONS.length} strength of materials questions with real-time
                feedback and step-by-step verified solutions.
              </p>

              <Link
                to="/practice"
                className="block text-center font-mono text-xs uppercase tracking-widest text-black bg-white hover:bg-slate-200 py-3 font-semibold transition-colors w-full"
              >
                [ START PRACTICE SESSION ]
              </Link>
            </div>

            {/* TOPIC KEY FORMULAS */}
            <div>
              <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-6 pb-2 border-b border-slate-900 flex items-center justify-between">
                <span>{/* Key Formula Index */}</span>
                <Sparkles className="w-3.5 h-3.5 text-slate-600" />
              </h3>

              <div className="space-y-4">
                {TOPIC_FORMULAS.map((item, i) => (
                  <div
                    key={item.name}
                    className="p-4 border border-slate-900 bg-slate-950/40 hover:border-slate-800 transition-colors"
                  >
                    <div className="font-mono text-[11px] text-slate-400 uppercase tracking-wider mb-1 flex items-center justify-between">
                      <span>{item.name}</span>
                      <span className="text-[10px] text-slate-600">0{i + 1}</span>
                    </div>
                    <div className="font-mono text-sm text-blue-400 mb-2 font-medium bg-slate-900/50 p-2 border border-slate-900">
                      {item.formula}
                    </div>
                    <div className="font-mono text-[10px] text-slate-500 tracking-wide">
                      {item.note}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* EXAM DISTRIBUTION */}
            <div>
              <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-6 pb-2 border-b border-slate-900 flex items-center justify-between">
                <span>{/* Exam Distribution */}</span>
                <BarChart2 className="w-3.5 h-3.5 text-slate-600" />
              </h3>

              <div className="space-y-4 font-mono text-xs">
                {EXAM_DISTRIBUTION.map((exam) => (
                  <div key={exam.name} className="space-y-1.5">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>{exam.name}</span>
                      <span className="text-slate-500">{exam.percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 overflow-hidden">
                      <div
                        className={`h-full ${exam.color}`}
                        style={{ width: `${exam.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TAXONOMY METADATA */}
            <div className="pt-6 border-t border-slate-900">
              <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-4">
                Taxonomy Context
              </h4>
              <dl className="space-y-3 font-mono text-xs">
                <div className="flex justify-between border-b border-slate-900/50 pb-2">
                  <dt className="text-slate-600">DISCIPLINE</dt>
                  <dd className="text-slate-300">Civil Engineering</dd>
                </div>
                <div className="flex justify-between border-b border-slate-900/50 pb-2">
                  <dt className="text-slate-600">DIFFICULTY CURVE</dt>
                  <dd className="text-amber-400">Moderate → Advanced</dd>
                </div>
                <div className="flex justify-between border-b border-slate-900/50 pb-2">
                  <dt className="text-slate-600">REVISION CYCLE</dt>
                  <dd className="text-slate-300">Q3 2026</dd>
                </div>
              </dl>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
