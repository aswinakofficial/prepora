import { createFileRoute, Link } from "@tanstack/react-router";
import { breadcrumbListJsonLd, canonicalLink, titleCase } from "../../../../lib/json-ld";
import { Skeleton, SkeletonRegion } from "../../../components/ui/Skeleton";

export const Route = createFileRoute("/exams/$examSlug/")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${titleCase(params.examSlug)} — Question Repository | Prepora`,
      },
      {
        name: "description",
        content: `Explore official previous-year question sets, subject breakdowns, and topic-wise practice for ${params.examSlug}.`,
      },
    ],
    links: [canonicalLink(`/exams/${params.examSlug}`)],
    scripts: [
      breadcrumbListJsonLd([
        { name: "Home", path: "/" },
        { name: "Exams", path: "/exams" },
        { name: titleCase(params.examSlug), path: `/exams/${params.examSlug}` },
      ]),
    ],
  }),
  component: ExamPage,
});

import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../../../lib/orpc";
import { CANONICAL_ORIGIN } from "../../../../lib/site-config";

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
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-20 md:pb-32">
      {/* docs/roadmap/engineering-roadmap.md item 26: Course JSON-LD, rendered here rather than in
          head() because it needs the real exam data useQuery fetches — this app has no loader/SSR
          data-hydration pattern anywhere (confirmed repo-wide), so head() only ever has access to
          route params. React 19 hoists <script> tags rendered anywhere in the tree into <head>. */}
      {realExam && (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify output, not user HTML.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Course",
              name: examName,
              description:
                realExam.description ||
                `Practice questions and verified explanations for ${examName}.`,
              provider: {
                "@type": "Organization",
                name: realExam.organization || examName,
              },
              url: `${CANONICAL_ORIGIN}/exams/${examSlug}`,
            }),
          }}
        />
      )}
      {/* Back Context */}
      <div className="px-4 sm:px-6 pt-4 md:pt-8 flex justify-between items-center max-w-[1200px] mx-auto mb-4 md:mb-6">
        <Link
          to="/exams"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO EXAMS
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-8 md:mb-10 border-b border-slate-900 pb-4 break-words">
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
        <div className="mb-10 md:mb-12 border-b border-slate-800 pb-8">
          <div className="max-w-5xl w-full">
            {isLoading ? (
              // Mirrors the loaded header: logo, then title, then description.
              <SkeletonRegion label="Loading exam…" className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                  <Skeleton className="w-14 h-14 sm:w-16 sm:h-16 shrink-0" />
                  <Skeleton className="h-9 sm:h-10 lg:h-12 rounded-md w-3/4 max-w-3xl" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full max-w-2xl" />
                  <Skeleton className="h-4 w-4/5 max-w-xl" />
                </div>
              </SkeletonRegion>
            ) : (
              <>
                {/* Logo beside the title from sm up, so the header stays compact enough for the
                    question sets to start on the first screen. */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 mb-5">
                  {realExam?.logoUrl && (
                    <img
                      src={realExam.logoUrl}
                      alt={examName}
                      className="w-14 h-14 sm:w-16 sm:h-16 object-contain shrink-0"
                    />
                  )}
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-normal tracking-tighter text-white leading-[1.1] break-words">
                    {examName.toUpperCase()}
                  </h1>
                </div>
                {realExam?.description && (
                  <p className="text-slate-400 font-normal text-sm md:text-base mb-0 max-w-3xl leading-relaxed font-sans">
                    {realExam.description}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Index Main Content */}
        <div className="space-y-12 md:space-y-16">
          {/* Question Sets Section */}
          <section>
            <div className="flex justify-between items-end border-b border-slate-900 pb-2 mb-8">
              <h2 className="font-mono text-xs uppercase tracking-[0.2em] sm:tracking-[0.3em] text-slate-400">
                Available Practice Question Sets (
                {isLoading ? (
                  <Skeleton className="inline-block h-3 w-4 align-middle" />
                ) : (
                  sets.length
                )}
                )
              </h2>
              <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest hidden sm:inline">
                SELECT A QUESTION SET TO START SIMULATION
              </span>
            </div>

            {isLoading ? (
              // Mirrors a loaded set row: number, tag/volume/code pills, title, and the two
              // Simulation / Learn buttons.
              <SkeletonRegion
                label="Loading question sets…"
                className="border-t-2 border-slate-900 border-b-2 flex flex-col divide-y divide-slate-900"
              >
                {[1, 2].map((n) => (
                  <div
                    key={n}
                    className="p-4 sm:p-8 bg-[#06080a] flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8"
                  >
                    <div className="flex items-start gap-6 flex-1">
                      <Skeleton className="h-4 w-8 mt-1" />
                      <div className="space-y-3 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <Skeleton className="h-6 w-28" />
                          <Skeleton className="h-3 w-32" />
                          <Skeleton className="h-3 w-28" />
                        </div>
                        <Skeleton className="h-7 w-3/4 max-w-xl" />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 shrink-0">
                      <Skeleton className="h-11 w-36" />
                      <Skeleton className="h-11 w-40" />
                    </div>
                  </div>
                ))}
              </SkeletonRegion>
            ) : (
              <div className="border-t-2 border-slate-900 border-b-2 flex flex-col divide-y divide-slate-900">
                {sets.map((set: any, idx: number) => (
                  <div
                    key={set.id || idx}
                    className="p-4 sm:p-8 bg-[#06080a] hover:bg-slate-900/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8 group"
                  >
                    <div className="flex items-start gap-6 flex-1">
                      <span className="font-mono text-sm text-slate-600 w-6 sm:w-8 pt-1 shrink-0">
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

                    <div className="flex items-center gap-3 shrink-0">
                      <Link
                        to="/practice"
                        search={{ examSlug, viewMode: "simulation" }}
                        className="flex-1 md:flex-none whitespace-nowrap font-mono text-xs uppercase tracking-wider sm:tracking-[0.15em] px-3 sm:px-5 py-3 border border-slate-700 hover:border-slate-400 text-slate-300 hover:text-white hover:bg-slate-900/60 transition-all text-center"
                      >
                        [ SIMULATION ]
                      </Link>
                      <Link
                        to="/practice"
                        search={{ examSlug, viewMode: "learn" }}
                        className="flex-1 md:flex-none whitespace-nowrap font-mono text-xs uppercase tracking-wider sm:tracking-[0.15em] px-3 sm:px-5 py-3 border border-sky-900/80 hover:border-sky-400 text-sky-400 hover:text-white hover:bg-sky-950/60 transition-all text-center"
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
