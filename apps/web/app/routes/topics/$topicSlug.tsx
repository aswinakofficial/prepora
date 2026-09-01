import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight, BookOpen } from "lucide-react";

export const Route = createFileRoute("/topics/$topicSlug")({
  head: ({ params }) => {
    const name = params.topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Questions & Answers | Prepora` },
        { name: "description", content: `Previous-year exam questions on ${name} with detailed explanations.` },
      ],
    };
  },
  component: TopicPage,
});

function TopicPage() {
  const { topicSlug } = Route.useParams();
  const name = topicSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const questions = [
    { slug: "unit-of-modulus-of-elasticity", text: "What is the unit of modulus of elasticity?", exam: "Kerala PSC AE", year: 2025 },
    { slug: "poissons-ratio-definition", text: "The ratio of lateral strain to linear strain is called?", exam: "SSC JE Civil", year: 2024 },
    { slug: "max-bending-moment-udl", text: "Maximum bending moment for simply supported beam with UDL is?", exam: "Kerala PSC AE", year: 2024 },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--muted-foreground)] mb-6 flex items-center gap-1 flex-wrap">
        <Link to="/" className="hover:underline">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/subjects" className="hover:underline">Subjects</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>{name}</span>
      </nav>
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-1">{name}</h1>
          <p className="text-[var(--muted-foreground)]">{questions.length} questions from previous-year papers</p>
        </div>
        <Link to="/practice" className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90 transition-opacity flex-shrink-0">
          Practice topic
        </Link>
      </div>
      <div className="space-y-3">
        {questions.map((q) => (
          <div key={q.slug} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] transition-all">
            <p className="font-medium text-sm mb-2">{q.text}</p>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <BookOpen className="w-3.5 h-3.5" />
              <span>{q.exam}</span>
              <span>·</span>
              <span>{q.year}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
