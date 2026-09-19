import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/exams/$examSlug/")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${params.examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} — Question Repository | Prepora`,
      },
      {
        name: "description",
        content: `Explore official previous-year question sets, subject breakdowns, and topic-wise practice for ${params.examSlug}.`,
      },
    ],
  }),
  component: ExamPage,
});

import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../../../lib/orpc";

function ExamPage() {
  const { examSlug } = Route.useParams();

  const { data: realExam, isLoading } = useQuery(
    orpc.exams.getBySlug.queryOptions({ input: { examSlug } }),
  );

  const rawName =
    realExam?.name || examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const examName = rawName.replace(/^Exam\s+/i, "");
  const _organization = realExam?.organization || "Microsoft Learn";

  const sets =
    realExam?.sets && realExam.sets.length > 0
      ? realExam.sets
      : [
          {
            id: `${examSlug}-set-1`,
            title: `${examName} — Official Assessment Set 01`,
            description: "",
            questionCount: realExam?.questionCount || 5,
            tag: "MICROSOFT LEARN OFFICIAL",
            code: "2026/MS-LEARN-01",
            year: 2026,
          },
        ];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Back Context */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link
          to="/exams"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO EXAMS
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/exams" className="hover:text-white transition-colors">
            EXAMS
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">{examSlug}</span>
        </div>

        {/* Top Header Section */}
        <div className="mb-20 border-b border-slate-800 pb-12">
          <div className="max-w-4xl w-full">
            {isLoading ? (
              <div className="space-y-6">
                <div className="h-10 sm:h-14 md:h-16 lg:h-20 bg-slate-900/90 animate-pulse rounded-md w-3/4 max-w-3xl" />
                <div className="space-y-3">
                  <div className="h-4 bg-slate-900/70 animate-pulse rounded w-full max-w-2xl" />
                  <div className="h-4 bg-slate-900/70 animate-pulse rounded w-4/5 max-w-xl" />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-6 mb-6">
                  {realExam?.logoUrl && (
                    <img
                      src={realExam.logoUrl}
                      alt={examName}
                      className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
                    />
                  )}
                  <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-normal tracking-tighter text-white leading-[1.12] break-words">
                    {examName.toUpperCase()}
                  </h1>
                </div>
                {realExam?.description && (
                  <p className="text-slate-400 font-normal text-sm md:text-base lg:text-lg mb-0 max-w-3xl leading-relaxed font-sans">
                    {realExam.description}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Index Main Content */}
        <div className="space-y-24">
          {/* Question Sets Section */}
          <section>
            <div className="flex justify-between items-end border-b border-slate-900 pb-2 mb-8">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400">
                {/* Available Practice Question Sets ( */}
                {isLoading ? "..." : sets.length})
              </h2>
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest hidden sm:inline">
                SELECT A QUESTION SET TO START SIMULATION
              </span>
            </div>

            {isLoading ? (
              <div className="border-t-2 border-slate-900 border-b-2 flex flex-col divide-y divide-slate-900">
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="p-8 bg-[#06080a] flex flex-col md:flex-row md:items-center justify-between gap-8 animate-pulse"
                  >
                    <div className="space-y-4 flex-1">
                      <div className="h-3 bg-slate-900 rounded w-48" />
                      <div className="h-6 bg-slate-900/90 rounded w-3/4 max-w-xl" />
                      <div className="h-4 bg-slate-900/60 rounded w-full max-w-2xl" />
                    </div>
                    <div className="h-12 w-48 bg-slate-900 rounded shrink-0" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-t-2 border-slate-900 border-b-2 flex flex-col divide-y divide-slate-900">
                {sets.map((set: any, idx: number) => (
                  <div
                    key={set.id || idx}
                    className="p-8 bg-[#06080a] hover:bg-slate-900/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-8 group"
                  >
                    <div className="flex items-start gap-6 flex-1">
                      <span className="font-mono text-sm text-slate-600 w-8 pt-1">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="inline-block font-mono text-[10px] text-sky-400 border border-sky-900/60 bg-sky-950/40 px-2.5 py-1 uppercase tracking-widest">
                            {set.tag || "PRACTICE SET"}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                            VOL: {set.questionCount} QUESTIONS
                          </span>
                          <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
                            • {set.code || "2026/MS-LEARN"}
                          </span>
                        </div>
                        <h3 className="text-xl md:text-2xl text-slate-200 group-hover:text-white font-light transition-colors leading-snug">
                          {set.title}
                        </h3>
                        {set.description && (
                          <p className="text-sm text-slate-400 font-light leading-relaxed max-w-3xl">
                            {set.description}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <Link
                        to="/practice"
                        search={{ examSlug, viewMode: "simulation" }}
                        className="font-mono text-xs uppercase tracking-[0.15em] px-5 py-3 border border-slate-700 hover:border-slate-400 text-slate-300 hover:text-white hover:bg-slate-900/60 transition-all text-center"
                      >
                        [ SIMULATION ]
                      </Link>
                      <Link
                        to="/practice"
                        search={{ examSlug, viewMode: "learn" }}
                        className="font-mono text-xs uppercase tracking-[0.15em] px-5 py-3 border border-sky-900/80 hover:border-sky-400 text-sky-400 hover:text-white hover:bg-sky-950/60 transition-all text-center"
                      >
                        [ LEARN MODE ] →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
