import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

export const Route = createFileRoute("/subjects/")({
  head: () => ({
    meta: [
      { title: "Subjects — Prepora" },
      { name: "description", content: "Browse exam questions by subject: Civil Engineering, Electronics, Computer Science, General Knowledge and more." },
    ],
  }),
  component: SubjectsPage,
});

const subjects = [
  { slug: "civil-engineering", name: "Civil Engineering", icon: "🏗️", count: 1200 },
  { slug: "mechanical-engineering", name: "Mechanical Engineering", icon: "⚙️", count: 900 },
  { slug: "electrical-engineering", name: "Electrical Engineering", icon: "⚡", count: 800 },
  { slug: "computer-science", name: "Computer Science", icon: "💻", count: 3000 },
  { slug: "general-knowledge", name: "General Knowledge", icon: "🌍", count: 600 },
  { slug: "mathematics", name: "Mathematics", icon: "📐", count: 1500 },
];

function SubjectsPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <nav aria-label="Breadcrumb" className="text-sm text-[var(--muted-foreground)] mb-6 flex items-center gap-1">
        <Link to="/" className="hover:underline">Home</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span>Subjects</span>
      </nav>
      <h1 className="text-3xl font-bold mb-2">Subjects</h1>
      <p className="text-[var(--muted-foreground)] mb-8">Browse questions by subject area.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjects.map((s) => (
          <Link key={s.slug} to="/subjects/$subjectSlug" params={{ subjectSlug: s.slug }}
            className="group flex items-center gap-4 p-5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:border-[var(--primary)] transition-all">
            <span className="text-3xl" aria-hidden="true">{s.icon}</span>
            <div>
              <h2 className="font-semibold group-hover:text-[var(--primary)] transition-colors">{s.name}</h2>
              <p className="text-xs text-[var(--muted-foreground)]">{s.count.toLocaleString()} questions</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
