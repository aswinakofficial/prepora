import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, BookOpen, Search, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/topics/$topicSlug")({
  head: ({ params }) => {
    const name = params.topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Topic Knowledge Index | Prepora` },
        {
          name: "description",
          content: `Master ${name} with previous-year exam questions and verified step-by-step explanations.`,
        },
        { property: "og:title", content: `${name} — Exam Questions Index | Prepora` },
      ],
    };
  },
  component: TopicPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to render a fixed 8-question
// Strength-of-Materials fixture (plus fabricated formula cards / exam-distribution percentages /
// a "revision cycle" date with no backing model) regardless of the actual topicSlug in the URL.
// It now queries topics.getBySlug for real questions scoped to the real topic, and the decorative
// unbacked stats have been removed entirely rather than kept as placeholder or illustrative content.

function TopicPage() {
  const { topicSlug } = Route.useParams();
  const fallbackName = topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: topic, isLoading } = useQuery(
    orpc.topics.getBySlug.queryOptions({ input: { topicSlug } }),
  );

  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("ALL");
  const [selectedExam, setSelectedExam] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const questions = topic?.questions ?? [];
  const name = topic?.name || fallbackName;

  const examOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const q of questions) {
      if (q.examSlug) seen.add(q.examSlug);
    }
    return [...seen];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchDiff =
        selectedDifficulty === "ALL" || (q.difficulty || "").toUpperCase() === selectedDifficulty;
      const matchExam = selectedExam === "ALL" || q.examSlug === selectedExam;
      const matchSearch =
        searchQuery.trim() === "" || q.text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDiff && matchExam && matchSearch;
    });
  }, [questions, selectedDifficulty, selectedExam, searchQuery]);

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
          {topic?.subjectSlug && (
            <>
              <span className="mx-4 text-slate-700">/</span>
              <Link
                to="/subjects/$subjectSlug"
                params={{ subjectSlug: topic.subjectSlug }}
                className="hover:text-white transition-colors"
              >
                {(topic.subjectName || topic.subjectSlug).toUpperCase()}
              </Link>
            </>
          )}
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
              {topic?.description && (
                <p className="font-mono text-xs tracking-widest text-slate-400 uppercase leading-relaxed max-w-2xl">
                  {topic.description}
                </p>
              )}
            </div>

            <div className="font-mono text-xs text-slate-500 tracking-widest uppercase text-left lg:text-right shrink-0 border-l lg:border-l-0 lg:border-r border-slate-900 pl-4 lg:pl-0 lg:pr-6 py-2">
              <div className="text-white text-lg font-light mb-1">
                {questions.length} VERIFIED QUESTIONS
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Layout (Left Question Stream, Right Sidebar) */}
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
                  placeholder="Filter by question text..."
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-slate-500 outline-none text-sm text-slate-200 placeholder-slate-600 pl-11 pr-4 py-3 font-mono transition-colors"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                {/* Difficulty Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mr-2">
                    DIFFICULTY:
                  </span>
                  {["ALL", "EASY", "MEDIUM", "HARD", "EXPERT"].map((diff) => (
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
                {examOptions.length > 0 && (
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
                      {examOptions.map((slug) => (
                        <option key={slug} value={slug}>
                          {slug.replace(/-/g, " ").toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* Questions Header */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500">
                {filteredQuestions.length} QUESTIONS
              </h2>
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600">
                Showing {filteredQuestions.length} of {questions.length} entries
              </span>
            </div>

            {/* Questions Stream */}
            <div className="border-t-2 border-slate-900 border-b-2 divide-y divide-slate-900/60">
              {isLoading ? (
                <div className="py-16 text-center">
                  <p className="font-mono text-sm text-slate-500">Loading questions…</p>
                </div>
              ) : filteredQuestions.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-mono text-sm text-slate-500 mb-2">
                    {questions.length === 0
                      ? "No published questions for this topic yet."
                      : "No matching questions found."}
                  </p>
                  {questions.length > 0 && (
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
                  )}
                </div>
              ) : (
                filteredQuestions.map((q) => (
                  <Link
                    key={q.id}
                    to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                    params={{
                      examSlug: q.examSlug,
                      variantSlug: q.variantSlug,
                      year: String(q.year),
                      subjectSlug: q.subjectSlug || "",
                      questionSlug: q.questionSlug,
                    }}
                    className="group block p-6 hover:bg-slate-900/40 transition-colors"
                  >
                    {/* Top Row: Exam Tag, Year, Difficulty */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border border-slate-800 text-slate-400">
                          {q.examSlug.replace(/-/g, " ")}
                        </span>
                        {q.year && (
                          <span className="font-mono text-[10px] text-slate-600">{q.year}</span>
                        )}
                      </div>

                      {q.difficulty && (
                        <span
                          className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                            q.difficulty === "easy"
                              ? "border-emerald-900/60 text-emerald-400 bg-emerald-950/20"
                              : q.difficulty === "medium"
                                ? "border-blue-900/60 text-blue-400 bg-blue-950/20"
                                : "border-amber-900/60 text-amber-400 bg-amber-950/20"
                          }`}
                        >
                          {q.difficulty}
                        </span>
                      )}
                    </div>

                    {/* Question Content */}
                    <h3 className="text-lg text-slate-200 group-hover:text-white font-light tracking-tight mb-4 leading-relaxed transition-colors">
                      {q.text}
                    </h3>

                    {/* Footer Row: Action Link */}
                    <div className="flex items-center justify-end text-xs font-mono">
                      <div className="flex items-center gap-1 text-slate-500 group-hover:text-white transition-colors tracking-widest uppercase text-[11px]">
                        <span>ACCESS QUESTION</span>
                        <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Right Column (Sidebar) */}
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
                {questions.length > 0
                  ? `Attempt all ${questions.length} ${name.toLowerCase()} questions with real-time feedback.`
                  : "No questions published for this topic yet."}
              </p>

              <Link
                to="/practice"
                className="block text-center font-mono text-xs uppercase tracking-widest text-black bg-white hover:bg-slate-200 py-3 font-semibold transition-colors w-full"
              >
                [ START PRACTICE SESSION ]
              </Link>
            </div>

            {topic?.subjectSlug && (
              <div className="pt-6 border-t border-slate-900">
                <h4 className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-4 flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5" />
                  Taxonomy Context
                </h4>
                <dl className="space-y-3 font-mono text-xs">
                  <div className="flex justify-between border-b border-slate-900/50 pb-2">
                    <dt className="text-slate-600">SUBJECT</dt>
                    <dd className="text-slate-300">{topic.subjectName || topic.subjectSlug}</dd>
                  </div>
                </dl>
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
