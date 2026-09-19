import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { orpc } from "../../../lib/orpc";

const examsSearchSchema = z.object({
  category: z.string().optional(),
});

export const Route = createFileRoute("/exams/")({
  validateSearch: (search) => examsSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Exam Directory — Prepora" },
      {
        name: "description",
        content:
          "Explore official previous-year question repositories for Kerala PSC, GATE, SSC JE, Azure, ISTQB, and university exams.",
      },
      { property: "og:title", content: "Exam Directory — Prepora" },
      {
        property: "og:description",
        content:
          "Explore official previous-year question repositories for global and local competitive exams, university papers, and strict certifications.",
      },
    ],
  }),
  component: ExamsPage,
});

function ExamsPage() {
  const { category: queryCategory } = Route.useSearch();
  const navigate = useNavigate();

  // Category tabs are sourced from the exam_types table (via orpc.exams.listTypes), not a
  // hand-maintained frontend constant — see docs/architecture/exam-domain-model.md §2, Limitation
  // 2, and docs/roadmap/engineering-roadmap.md item 10. A new exam type shows up here as soon as
  // it's inserted, with no frontend code change.
  const { data: examTypesData } = useQuery(orpc.exams.listTypes.queryOptions());

  const CATEGORIES = useMemo(
    () => [
      { id: "ALL", label: "ALL EXAMS" },
      ...(examTypesData || []).map((t) => ({
        id: t.slug.toUpperCase(),
        label: `${t.label.toUpperCase()} EXAMS`,
      })),
    ],
    [examTypesData],
  );

  const getInitialCategory = () => {
    if (!queryCategory) return "ALL";
    const normalized = queryCategory.toUpperCase();
    const match = CATEGORIES.find((c) => c.id === normalized);
    return match ? match.id : "ALL";
  };

  const [selectedCategory, setSelectedCategory] = useState(getInitialCategory);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    if (queryCategory) {
      const normalized = queryCategory.toUpperCase();
      const match = CATEGORIES.find((c) => c.id === normalized);
      if (match) {
        setSelectedCategory(match.id);
      }
    }
  }, [queryCategory, CATEGORIES]);

  const handleCategorySelect = (catId: string) => {
    setSelectedCategory(catId);
    navigate({
      to: "/exams",
      search: { category: catId === "ALL" ? undefined : catId.toLowerCase() } as any,
      replace: true,
    });
  };

  const { data: realExams, isLoading } = useQuery(
    orpc.exams.list.queryOptions({ input: { limit: 100 } }),
  );

  const examsToRender = (realExams || []).map((dbExam: any) => ({
    slug: dbExam.slug || "unknown",
    name: dbExam.name || dbExam.title || "Subject",
    org: dbExam.org || dbExam.organization || "Microsoft Learn",
    category: (dbExam.category || dbExam.domain || "CERTIFICATION").toUpperCase(),
    // The real exam_types.slug, joined server-side — this is what makes category filtering an
    // exact match instead of the previous fragile substring guessing (e.g. "GATE"/"SSC" implying
    // "COMPETITIVE"). Falls back to the display category for any legacy shape that lacks it.
    categorySlug: (dbExam.categorySlug || dbExam.category || dbExam.domain || "").toUpperCase(),
    code: dbExam.code || dbExam.stableContentId || "EXT-000",
    count: dbExam.count !== undefined ? dbExam.count : 5,
    logoUrl: dbExam.logoUrl,
  }));

  const filteredExams = examsToRender.filter((exam) => {
    const matchesCategory = selectedCategory === "ALL" || exam.categorySlug === selectedCategory;

    const matchesQuery =
      exam.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      exam.code.toLowerCase().includes(filterQuery.toLowerCase()) ||
      exam.org.toLowerCase().includes(filterQuery.toLowerCase());

    return matchesCategory && matchesQuery;
  });

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Breadcrumb section */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
        <Link
          to="/"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors"
        >
          ← BACK TO INDEX
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-32 border-b border-slate-900 pb-4">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-slate-300">EXAM DIRECTORY</span>
        </div>

        {/* Page Header */}
        <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight">
              EXAMINATION HUBS
            </h1>
            <p className="font-mono text-xs tracking-widest text-slate-500 uppercase">
              Browse the global repository of examination nodes and structured contexts.
            </p>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <label
              htmlFor="exams-quick-filter"
              className="font-mono text-[10px] text-slate-600 tracking-widest uppercase"
            >
              Quick Filter
            </label>
            <input
              id="exams-quick-filter"
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder="SEARCH CATALOGUE..."
              className="bg-transparent border-b border-slate-600 text-white font-mono text-sm pb-2 outline-none focus:border-white transition-colors placeholder-slate-700 w-full sm:w-64"
            />
          </div>
        </div>

        {/* Structural Filter Bar */}
        <div className="mb-12 border-b border-slate-900 pb-4 overflow-x-auto">
          <div className="flex items-center gap-6 font-mono text-xs tracking-widest text-slate-500 min-w-max">
            {CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className={`hover:text-white transition-colors py-1 ${
                  selectedCategory === cat.id
                    ? "text-sky-400 font-bold border-b-2 border-sky-400"
                    : ""
                }`}
              >
                [{cat.label}]
              </button>
            ))}
          </div>
        </div>

        {/* Monolithic Index List */}
        <div className="border-t-2 border-slate-900 border-b-2">
          {/* Table Header (Hidden on small screens) */}
          <div className="hidden md:grid grid-cols-12 gap-6 p-4 border-b border-slate-900 font-mono text-[10px] text-slate-600 tracking-widest uppercase">
            <div className="col-span-2">NODE ID</div>
            <div className="col-span-4">EXAMINATION NAME</div>
            <div className="col-span-3">AUTHORITY</div>
            <div className="col-span-2">CATEGORY</div>
            <div className="col-span-1 text-right">ACTION</div>
          </div>

          {isLoading ? (
            <div className="font-mono text-xs text-slate-500 uppercase tracking-widest py-16 text-center animate-pulse">
              FETCHING CATALOGUE FROM oRPC ENGINE...
            </div>
          ) : filteredExams.length > 0 ? (
            filteredExams.map((exam) => (
              <Link
                key={exam.slug}
                to="/exams/$examSlug"
                params={{ examSlug: exam.slug }}
                className="group flex flex-col md:grid md:grid-cols-12 gap-4 md:gap-6 p-4 md:items-center border-b border-slate-900/50 hover:bg-slate-900/30 transition-colors"
              >
                <div className="col-span-2 font-mono text-xs text-slate-500 group-hover:text-white transition-colors">
                  {exam.code.toUpperCase()}
                </div>

                <div className="col-span-4 text-slate-300 group-hover:text-white transition-colors text-lg font-light truncate flex items-center gap-3">
                  {exam.logoUrl && (
                    <img src={exam.logoUrl} alt="" className="w-6 h-6 shrink-0 object-contain" />
                  )}
                  <span>{exam.name}</span>
                </div>

                <div className="col-span-3 font-mono text-[10px] text-slate-500 uppercase truncate">
                  {exam.org}
                </div>

                <div className="col-span-2">
                  <span className="font-mono text-[10px] text-slate-600 border border-slate-800 px-2 py-1 uppercase">
                    {exam.category}
                  </span>
                </div>

                <div className="col-span-1 md:text-right font-mono text-xs text-slate-500 group-hover:text-sky-400 transition-colors mt-2 md:mt-0">
                  →
                </div>
              </Link>
            ))
          ) : (
            <div className="font-mono text-xs text-slate-600 uppercase tracking-widest py-16 text-center">
              NO MATCHING NODES FOUND.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
