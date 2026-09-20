import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/subjects/$subjectSlug")({
  head: ({ params }) => {
    const name = params.subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Previous Year Questions | Prepora` },
        {
          name: "description",
          content: `Browse all previous-year exam questions for ${name} with answers and explanations.`,
        },
      ],
    };
  },
  component: SubjectPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to render the same fixed 5-topic
// civil-engineering list for every subject slug. It now queries subjects.getBySlug for the real
// subject's real topics with real published-question counts. The decorative "Global Weight" stat
// (no backing model) has been removed rather than kept as placeholder content.

function SubjectPage() {
  const { subjectSlug } = Route.useParams();
  const fallbackName = subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: subject, isLoading } = useQuery(
    orpc.subjects.getBySlug.queryOptions({ input: { subjectSlug } }),
  );

  const topics = subject?.topics ?? [];
  const name = subject?.name || fallbackName;
  const totalQuestions = topics.reduce((acc, t) => acc + t.questionCount, 0);

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Back Context */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link
          to="/subjects"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO MATRIX
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-24 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/subjects" className="hover:text-white transition-colors">
            SUBJECTS
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">{subjectSlug}</span>
        </div>

        {/* Page Header */}
        <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              {name.toUpperCase()}
            </h1>
            {subject?.description && (
              <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
                {subject.description}
              </p>
            )}
          </div>
          {topics.length > 0 && (
            <div className="font-mono text-[10px] text-slate-600 tracking-widest uppercase text-right shrink-0">
              {topics.length} CLUSTERS <br />
              TOTAL VOLUME: {totalQuestions} Qs
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-16">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <div className="border-t-2 border-slate-900 border-b-2">
              {isLoading ? (
                <div className="py-16 text-center">
                  <p className="font-mono text-sm text-slate-500">Loading topics…</p>
                </div>
              ) : topics.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="font-mono text-sm text-slate-500">
                    No topics published for this subject yet.
                  </p>
                </div>
              ) : (
                topics.map((t, idx) => (
                  <Link
                    key={t.slug}
                    to="/topics/$topicSlug"
                    params={{ topicSlug: t.slug }}
                    className="flex flex-col md:flex-row md:items-center justify-between p-6 border-b border-slate-900/50 hover:bg-slate-900/40 transition-colors group"
                  >
                    <div className="flex items-center gap-6">
                      <span className="font-mono text-sm text-slate-600 w-8">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h3 className="text-xl text-slate-300 group-hover:text-white transition-colors font-light">
                        {t.name}
                      </h3>
                    </div>
                    <div className="font-mono text-[10px] uppercase text-slate-500 tracking-widest mt-4 md:mt-0 flex items-center gap-4">
                      <span>{t.questionCount} VOL</span>
                      <span className="text-slate-800">/</span>
                      <span className="text-slate-600 group-hover:text-slate-400 transition-colors">
                        ACCESS →
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Sidebar */}
          {topics.length > 0 && (
            <aside className="lg:col-span-1 border-t lg:border-t-0 lg:border-l border-slate-900 pt-12 lg:pt-0 lg:pl-12">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-8 pb-2 border-b border-slate-900">
                Taxonomy Metadata
              </h3>
              <div className="space-y-6">
                <div className="border-b border-slate-900/50 pb-4">
                  <div className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-1">
                    Total Sub-topics
                  </div>
                  <div className="text-xl text-slate-200 font-light">{topics.length}</div>
                </div>
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
