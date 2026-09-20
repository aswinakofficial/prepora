import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type React from "react";
import { z } from "zod";
import { canonicalLink } from "../../lib/json-ld";
import { orpc } from "../../lib/orpc";

const searchSchema = z.object({
  q: z.string().optional().default(""),
});

export const Route = createFileRoute("/search")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Search — Prepora" },
      { name: "description", content: "Search exams, questions, subjects, and topics on Prepora." },
      { property: "og:title", content: "Search — Prepora" },
      {
        property: "og:description",
        content:
          "Search real previous year questions, exams, subjects, and specific topics on Prepora's knowledge index.",
      },
    ],
    // Canonicalizes to the base path regardless of ?q= — a search results page isn't unique,
    // indexable content per query string.
    links: [canonicalLink("/search")],
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();
  const hasQuery = q.trim().length > 0;

  // docs/roadmap/engineering-roadmap.md item 23: real results from the database, behind the
  // SearchProvider interface (packages/api/src/search/) — no hardcoded results remain.
  const { data } = useQuery({
    ...orpc.search.query.queryOptions({ input: { q } }),
    enabled: hasQuery,
  });
  const { mutate: logClick } = useMutation(orpc.search.logClick.mutationOptions());

  const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const query = fd.get("q") as string;
    if (query.trim()) {
      navigate({ to: "/search", search: { q: query } as any });
    }
  };

  const handleResultClick = (resultId: string) => {
    if (data?.searchQueryId) {
      logClick({ searchQueryId: data.searchQueryId, resultId });
    }
  };

  const questions = data?.questions ?? [];
  const exams = data?.exams ?? [];
  const topics = data?.topics ?? [];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Breadcrumb */}
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1000px] mx-auto">
        <Link
          to="/"
          className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors cursor-pointer"
        >
          ← BACK
        </Link>
      </div>

      <main className="max-w-[1000px] mx-auto px-6 pt-12">
        {/* Search Input - Command Surface */}
        <div className="mb-24">
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="absolute top-0 left-0 w-3 h-3 border-t border-l border-slate-700"></div>
            <div className="absolute bottom-0 right-0 w-3 h-3 border-b border-r border-slate-700"></div>
            <input
              name="q"
              type="text"
              defaultValue={q}
              placeholder="Search Prepora..."
              className="w-full bg-transparent border border-slate-900 outline-none text-3xl md:text-5xl lg:text-6xl p-6 md:p-8 text-white placeholder-slate-800 transition-colors rounded-none font-light tracking-tight"
            />
          </form>
        </div>

        {!hasQuery ? (
          <div className="max-w-md">
            <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8">
              Recent
            </h2>
            <div className="flex flex-col border-t border-slate-900">
              {["Exams", "Questions", "Topics", "Question Sets"].map((term) => (
                <div
                  key={term}
                  className="py-4 border-b border-slate-900 text-slate-400 hover:text-white cursor-pointer transition-colors"
                >
                  {term}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-24">
            {/* Meta info about results */}
            <div className="border-b border-slate-800 pb-8">
              <h1 className="text-3xl text-white font-light tracking-tight mb-4">
                Search results for "{q}"
              </h1>
              <p className="font-mono text-xs text-slate-500 tracking-wider">
                {questions.length} QUESTIONS · {exams.length} EXAMS · {topics.length} TOPICS
              </p>
            </div>

            {questions.length === 0 && exams.length === 0 && topics.length === 0 && (
              <div className="text-slate-500 font-mono text-sm">
                No results. Try a different phrase.
              </div>
            )}

            {/* QUESTIONS */}
            {questions.length > 0 && (
              <section>
                <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-12">
                  Questions
                </h2>
                <div className="flex flex-col">
                  {questions.map((question, i) => {
                    const canLink =
                      question.examSlug &&
                      question.examVariantSlug &&
                      question.year != null &&
                      question.subjectSlug;
                    const content = (
                      <>
                        <span className="block font-mono text-xs text-slate-600 mb-6">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <h3 className="text-2xl text-slate-200 font-light mb-8 max-w-2xl leading-snug">
                          {question.questionText}
                        </h3>
                        <div className="flex flex-col gap-1 font-mono text-xs text-slate-500">
                          {question.examSlug && <span>{question.examSlug}</span>}
                          {question.subjectSlug && <span>{question.subjectSlug}</span>}
                          {question.year != null && <span>{question.year}</span>}
                        </div>
                      </>
                    );

                    return canLink ? (
                      <Link
                        key={question.id}
                        to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                        params={{
                          examSlug: question.examSlug as string,
                          variantSlug: question.examVariantSlug as string,
                          year: String(question.year),
                          subjectSlug: question.subjectSlug as string,
                          questionSlug: question.slug,
                        }}
                        onClick={() => handleResultClick(question.id)}
                        className="group pb-12 mb-12 border-b border-slate-900/50 block"
                      >
                        {content}
                      </Link>
                    ) : (
                      <div key={question.id} className="pb-12 mb-12 border-b border-slate-900/50">
                        {content}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* EXAMS & TOPICS in asymmetric split */}
            {(exams.length > 0 || topics.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16 md:gap-8">
                <section>
                  <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8 border-b border-slate-900 pb-4">
                    Exams
                  </h2>
                  <div className="flex flex-col">
                    {exams.map((e) => (
                      <Link
                        key={e.id}
                        to="/exams/$examSlug"
                        params={{ examSlug: e.slug }}
                        onClick={() => handleResultClick(e.id)}
                        className="py-4 border-b border-slate-900/40 text-slate-300 hover:text-white flex gap-4 transition-colors"
                      >
                        <span>{e.name}</span>
                      </Link>
                    ))}
                  </div>
                </section>

                <section>
                  <h2 className="text-sm font-mono tracking-widest text-slate-500 uppercase mb-8 border-b border-slate-900 pb-4">
                    Topics
                  </h2>
                  <div className="flex flex-col">
                    {topics.map((t) => (
                      <Link
                        key={t.id}
                        to="/topics/$topicSlug"
                        params={{ topicSlug: t.slug }}
                        onClick={() => handleResultClick(t.id)}
                        className="py-4 border-b border-slate-900/40 text-slate-300 hover:text-white flex gap-4 transition-colors"
                      >
                        <span>{t.name}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
