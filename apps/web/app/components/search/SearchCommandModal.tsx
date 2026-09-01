import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface SearchCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SAMPLE_SUGGESTIONS = {
  exams: [
    { title: "Microsoft Azure Administrator", slug: "azure-az-104", code: "AZ-104" },
    { title: "ISTQB Foundation Level", slug: "istqb-ctfl", code: "CTFL 2026" },
    { title: "Kerala PSC Civil Engineering", slug: "kerala-psc-ae-civil", code: "PSC 2025" },
  ],
  topics: [
    { name: "Modulus of Elasticity", subject: "Strength of Materials" },
    { name: "Azure Storage Accounts & Blob Tiers", subject: "Cloud Infrastructure" },
    { name: "Equivalence Partitioning & Boundary Value Analysis", subject: "Software Testing" },
  ],
  questions: [
    { text: "What is the unit of modulus of elasticity?", exam: "Kerala PSC 2025" },
    { text: "Which storage redundancy option provides 16 nines of durability?", exam: "AZ-104" },
    { text: "What is the main objective of regression testing?", exam: "ISTQB CTFL" },
  ],
};

export function SearchCommandModal({ isOpen, onClose }: SearchCommandModalProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

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

  const handleSelectExam = (slug: string) => {
    navigate({ to: `/exams/${slug}` as any });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-0 sm:pt-24 px-0 sm:px-4 bg-[#06080a]/90 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-4xl bg-[#06080a] border border-slate-800 shadow-2xl flex flex-col md:h-auto h-full max-h-[85vh]">
        
        {/* Top Control Bar */}
        <div className="flex justify-between items-center border-b border-slate-800/80 p-4 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          <span>Global Scan Engine</span>
          <button onClick={onClose} className="hover:text-white transition-colors">
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
              autoFocus
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
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-3 divide-y-2 md:divide-y-0 md:divide-x-2 divide-slate-900 text-sm">
          
          {/* Exams Column */}
          <div className="p-8">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-slate-600 mb-8 pb-2 border-b border-slate-900">
              Exam Nodes
            </h3>
            <div className="flex flex-col gap-6">
              {SAMPLE_SUGGESTIONS.exams.map((exam) => (
                <button
                  key={exam.slug}
                  onClick={() => handleSelectExam(exam.slug)}
                  className="group text-left"
                >
                  <div className="font-mono text-[10px] text-slate-600 group-hover:text-white transition-colors mb-2">
                    {exam.code}
                  </div>
                  <div className="text-slate-300 group-hover:text-white transition-colors leading-snug">
                    {exam.title}
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
              {SAMPLE_SUGGESTIONS.topics.map((topic, i) => (
                <button
                  key={i}
                  onClick={() => {
                    navigate({ to: "/search", search: { q: topic.name } as any });
                    onClose();
                  }}
                  className="group text-left"
                >
                  <div className="text-slate-300 group-hover:text-white transition-colors leading-snug mb-2">
                    {topic.name}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600 group-hover:text-slate-400 transition-colors">
                    SUBJECT: {topic.subject.toUpperCase()}
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
              {SAMPLE_SUGGESTIONS.questions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => {
                    navigate({ to: "/search", search: { q: q.text } as any });
                    onClose();
                  }}
                  className="group text-left"
                >
                  <div className="text-slate-300 group-hover:text-white transition-colors leading-snug mb-2 line-clamp-3">
                    {q.text}
                  </div>
                  <div className="font-mono text-[10px] text-slate-600">
                    SRC: {q.exam.toUpperCase()}
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>

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
