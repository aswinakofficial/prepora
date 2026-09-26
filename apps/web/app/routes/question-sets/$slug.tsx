import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { breadcrumbListJsonLd, canonicalLink, titleCase } from "../../../lib/json-ld";
import { orpc } from "../../../lib/orpc";
import { SkeletonListRows } from "../../components/ui/Skeleton";

export const Route = createFileRoute("/question-sets/$slug")({
  head: ({ params }) => ({
    meta: [
      {
        title: `${titleCase(params.slug)} — Question Set | Prepora`,
      },
      {
        name: "description",
        content: `Browse all high-yield practice questions from this curated exam question set with verified step-by-step explanations.`,
      },
    ],
    links: [canonicalLink(`/question-sets/${params.slug}`)],
    scripts: [
      breadcrumbListJsonLd([
        { name: "Home", path: "/" },
        { name: "Exams", path: "/exams" },
        { name: titleCase(params.slug), path: `/question-sets/${params.slug}` },
      ]),
    ],
  }),
  component: QuestionSetPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to render a fixed 5-question
// fixture, and every question link hardcoded examSlug/variantSlug/year/subjectSlug to
// "kerala-psc-ae-civil"/"paper-1"/"2025"/"strength-of-materials" regardless of the actual set slug
// in the URL — every question-set page linked to the same wrong question URLs. It now queries
// questionSets.getBySlug for the real set and links each question to its real occurrence.

function QuestionSetPage() {
  const { slug } = Route.useParams();
  const fallbackTitle = slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: set, isLoading } = useQuery(
    orpc.questionSets.getBySlug.queryOptions({ input: { slug } }),
  );

  const questions = set?.questions ?? [];
  const title = set?.title || fallbackTitle;

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Back Context */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1000px] mx-auto mb-16">
        <Link
          to="/"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO INDEX
        </Link>
      </div>

      <main className="max-w-[1000px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
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
              {questions.length} QUESTIONS
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
          {isLoading ? (
            <SkeletonListRows label="Loading questions…" />
          ) : questions.length === 0 ? (
            <div className="py-16 text-center">
              <p className="font-mono text-sm text-slate-500">
                No published questions in this set yet.
              </p>
            </div>
          ) : (
            questions.map((q) => (
              <Link
                key={q.slug}
                to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                params={{
                  examSlug: q.examSlug,
                  variantSlug: q.variantSlug,
                  year: String(q.year),
                  subjectSlug: q.subjectSlug || "",
                  questionSlug: q.slug,
                }}
                className="group flex flex-col md:flex-row md:items-center justify-between gap-4 py-8 border-b border-slate-900/50 hover:bg-slate-900/30 transition-colors px-4 -mx-4"
              >
                <div className="flex gap-6 items-baseline min-w-0">
                  <span className="font-mono text-sm tracking-widest text-slate-600 group-hover:text-slate-300 transition-colors shrink-0 w-8">
                    {String(q.number).padStart(2, "0")}
                  </span>
                  <span className="text-lg text-slate-300 group-hover:text-white transition-colors truncate max-w-2xl font-light">
                    {q.text}
                  </span>
                </div>
                <div className="flex items-center gap-6 shrink-0 pl-14 md:pl-0">
                  <span className="text-xs font-mono text-slate-600">{q.topic.toUpperCase()}</span>
                  {q.difficulty && (
                    <span className="text-xs font-mono text-slate-500 border border-slate-800 px-2 py-1">
                      {q.difficulty.toUpperCase()}
                    </span>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
