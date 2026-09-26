import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type React from "react";
import { useEffect, useState } from "react";
import { trackEvent } from "../../../lib/analytics";
import { orpc } from "../../../lib/orpc";

interface SearchCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DEBOUNCE_MS = 300;

export function SearchCommandModal({ isOpen, onClose }: SearchCommandModalProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const navigate = useNavigate();

  // docs/roadmap/engineering-roadmap.md item 23: real results from the database, behind the
  // SearchProvider interface — no hardcoded suggestions remain. Debounced so search_queries logs
  // one row per pause in typing, not one per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // docs/roadmap/engineering-roadmap.md item 27: fires once per debounced query, alongside (not
  // instead of) search_queries logging (item 23) — analyticsEvents is the unified product-events
  // stream the admin dashboard reads; search_queries stays the richer, search-specific record.
  useEffect(() => {
    if (debouncedQuery.length > 0) {
      trackEvent("search", { meta: { q: debouncedQuery } });
    }
  }, [debouncedQuery]);

  const { data } = useQuery({
    ...orpc.search.query.queryOptions({ input: { q: debouncedQuery, limit: 5 } }),
    enabled: debouncedQuery.length > 0,
  });
  const { mutate: logClick } = useMutation(orpc.search.logClick.mutationOptions());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate({ to: "/search", search: { q: query } as any });
      onClose();
    }
  };

  const handleResultClick = (resultId: string, entityType: "exam" | "topic" | "question") => {
    if (data?.searchQueryId) {
      logClick({ searchQueryId: data.searchQueryId, resultId });
    }
    trackEvent("result_click", { entityType, entityId: resultId });
  };

  const handleSelectExam = (slug: string, resultId: string) => {
    handleResultClick(resultId, "exam");
    navigate({ to: `/exams/${slug}` as any });
    onClose();
  };

  const exams = data?.exams ?? [];
  const topics = data?.topics ?? [];
  const questions = data?.questions ?? [];
  const hasResults = exams.length > 0 || topics.length > 0 || questions.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-0 sm:pt-24 px-0 sm:px-4 bg-[#06080a]/90 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-4xl bg-[#06080a] border border-slate-800 shadow-2xl flex flex-col md:h-auto h-full max-h-[85vh]">
        {/* Top Control Bar */}
        <div className="flex justify-between items-center border-b border-slate-800/80 p-4 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          <span>Global Scan Engine</span>
          <button type="button" onClick={onClose} className="hover:text-white transition-colors">
            [ CLOSE ]
          </button>
        </div>

        {/* Huge Command Input */}
        <form onSubmit={handleSearchSubmit} className="p-8 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-3xl text-slate-700 font-mono font-light">/</span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Query indices..."
              className="w-full bg-transparent text-slate-100 placeholder-slate-700 text-3xl font-light outline-none border-none focus:ring-0"
            />
            {query && (
              <button
                type="submit"
                className="font-mono text-xs text-white bg-slate-900 border border-slate-700 px-3 py-2 uppercase tracking-widest hover:bg-slate-800 transition-colors"
              >
                Execute
              </button>
            )}
          </div>
        </form>

        {/* Structural Results Grid */}
        {query.trim().length > 0 && !hasResults ? (
          <div className="flex-1 p-8 text-slate-500 font-mono text-sm">No results yet.</div>
        ) : (
          <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 divide-y-2 md:divide-y-0 md:divide-x-2 divide-slate-900 text-sm">
            {/* Exams Column */}
            <div className="p-8">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-600 mb-8 pb-2 border-b border-slate-900">
                Exam Nodes
              </h3>
              <div className="flex flex-col gap-6">
                {exams.map((exam) => (
                  <button
                    type="button"
                    key={exam.id}
                    onClick={() => handleSelectExam(exam.slug, exam.id)}
                    className="group text-left"
                  >
                    <div className="text-slate-300 group-hover:text-white transition-colors leading-snug">
                      {exam.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Topics Column */}
            <div className="p-8">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-600 mb-8 pb-2 border-b border-slate-900">
                Topic Clusters
              </h3>
              <div className="flex flex-col gap-6">
                {topics.map((topic) => (
                  <button
                    type="button"
                    key={topic.id}
                    onClick={() => {
                      handleResultClick(topic.id, "topic");
                      navigate({ to: "/topics/$topicSlug", params: { topicSlug: topic.slug } });
                      onClose();
                    }}
                    className="group text-left"
                  >
                    <div className="text-slate-300 group-hover:text-white transition-colors leading-snug mb-2">
                      {topic.name}
                    </div>
                    <div className="font-mono text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                      SUBJECT: {topic.subjectSlug.toUpperCase()}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Questions Column */}
            <div className="p-8">
              <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-600 mb-8 pb-2 border-b border-slate-900">
                Direct Queries
              </h3>
              <div className="flex flex-col gap-6">
                {questions.map((q) => {
                  const canLink =
                    q.examSlug && q.examVariantSlug && q.year != null && q.subjectSlug;
                  return (
                    <button
                      type="button"
                      key={q.id}
                      onClick={() => {
                        handleResultClick(q.id, "question");
                        if (canLink) {
                          navigate({
                            to: "/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug",
                            params: {
                              examSlug: q.examSlug as string,
                              variantSlug: q.examVariantSlug as string,
                              year: String(q.year),
                              subjectSlug: q.subjectSlug as string,
                              questionSlug: q.slug,
                            },
                          });
                        } else {
                          navigate({ to: "/search", search: { q: q.questionText } as any });
                        }
                        onClose();
                      }}
                      className="group text-left"
                    >
                      <div className="text-slate-300 group-hover:text-white transition-colors leading-snug mb-2 line-clamp-3">
                        {q.questionText}
                      </div>
                      {q.examSlug && (
                        <div className="font-mono text-[10px] text-slate-600">
                          SRC: {q.examSlug.toUpperCase()}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer info bar */}
        <div className="p-4 border-t border-slate-900 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-slate-600 bg-slate-950/20 shrink-0">
          <div className="flex gap-6">
            <span>[RET] Select</span>
            <span>[ESC] Dismiss</span>
          </div>
          <span>Status: Online</span>
        </div>
      </div>
    </div>
  );
}
