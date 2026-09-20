import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "../../../../../lib/orpc";

export const Route = createFileRoute("/exams/$examSlug/subjects/$subjectSlug")({
  head: ({ params }) => {
    const examName = params.examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const subjectName = params.subjectSlug
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${subjectName} — ${examName} | Prepora` },
        {
          name: "description",
          content: `Explore verified previous-year questions for ${subjectName} in ${examName}.`,
        },
      ],
    };
  },
  component: ExamSubjectPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to render three fabricated
// "Copilot Studio" / "Multi-Agent Orchestration" topic cards regardless of the actual exam or
// subject, each linking only to /practice rather than any real question. It now lists the real
// published questions for this exam scoped to this subject directly, sourced from the same
// exams.getBySlug payload exams/$examSlug/index.tsx already uses.

function ExamSubjectPage() {
  const { examSlug, subjectSlug } = Route.useParams();

  const { data: realExam, isLoading } = useQuery(
    orpc.exams.getBySlug.queryOptions({ input: { examSlug } }),
  );

  const examName =
    realExam?.name || examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const subjectName = subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const questions = (realExam?.questions || []).filter((q: any) => q.subjectSlug === subjectSlug);

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
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/exams" className="hover:text-white transition-colors">
            EXAMS
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link
            to="/exams/$examSlug"
            params={{ examSlug }}
            className="hover:text-white transition-colors"
          >
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
              Domain module within <span className="text-slate-300">{examName}</span> covering
              practice questions and verified solutions.
            </p>
          </div>
          <div className="font-mono text-[10px] text-slate-600 tracking-widest uppercase text-right shrink-0">
            TOTAL VOLUME: {questions.length} Qs
          </div>
        </div>

        <div className="border-t-2 border-slate-900 border-b-2">
          {isLoading ? (
            <div className="py-16 text-center">
              <p className="font-mono text-sm text-slate-500">Loading questions…</p>
            </div>
          ) : questions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-mono text-sm text-slate-500">
                No published questions for this subject in {examName} yet.
              </p>
            </div>
          ) : (
            questions.map((q: any, idx: number) => (
              <Link
                key={q.id}
                to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                params={{
                  examSlug: q.examSlug,
                  variantSlug: q.variantSlug,
                  year: String(q.year),
                  subjectSlug: q.subjectSlug || subjectSlug,
                  questionSlug: q.questionSlug,
                }}
                className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-slate-900/50 hover:bg-slate-900/40 transition-colors group"
              >
                <div className="flex items-center gap-6 min-w-0">
                  <span className="font-mono text-sm text-slate-600 w-8 shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-lg text-slate-300 group-hover:text-white transition-colors font-light truncate">
                    {q.text}
                  </h3>
                </div>
                <div className="font-mono text-[10px] uppercase text-slate-500 tracking-widest mt-4 md:mt-0 flex items-center gap-4 shrink-0">
                  <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
                    ACCESS →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
