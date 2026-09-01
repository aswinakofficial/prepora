import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/subjects/$subjectSlug")({
  head: ({ params }) => {
    const name = params.subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      meta: [
        { title: `${name} — Previous Year Questions | Prepora` },
        { name: "description", content: `Browse all previous-year exam questions for ${name} with answers and explanations.` },
      ],
    };
  },
  component: SubjectPage,
});

function SubjectPage() {
  const { subjectSlug } = Route.useParams();
  const name = subjectSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const topics = [
    { slug: "strength-of-materials", name: "Strength of Materials", count: 180 },
    { slug: "concrete-technology", name: "Concrete Technology", count: 120 },
    { slug: "theory-of-structures", name: "Theory of Structures", count: 200 },
    { slug: "soil-mechanics", name: "Soil Mechanics", count: 150 },
    { slug: "fluid-mechanics", name: "Fluid Mechanics", count: 130 },
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
      <h1 className="text-3xl font-bold mb-2">{name}</h1>
      <p className="text-[var(--muted-foreground)] mb-8">Browse topics and previous-year questions for {name}.</p>
      <div className="space-y-2">
        {topics.map((t) => (
          <Link key={t.slug} to="/topics/$topicSlug" params={{ topicSlug: t.slug }}
            className="group flex items-center justify-between p-4 rounded-lg border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] transition-all">
            <div>
              <span className="font-medium group-hover:text-[var(--primary)] transition-colors">{t.name}</span>
              <span className="text-xs text-[var(--muted-foreground)] ml-2">{t.count} questions</span>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
          </Link>
        ))}
      </div>
    </div>
  );
}
