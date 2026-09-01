import React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, FileText, Users, MessageSquare, Flag, TrendingUp, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — Prepora" }] }),
  component: AdminDashboard,
});

const stats = [
  { label: "Published Questions", value: "2,400", icon: FileText, color: "text-[var(--primary)]" },
  { label: "Question Sets", value: "32", icon: BookOpen, color: "text-[var(--success)]" },
  { label: "Pending Review", value: "14", icon: AlertTriangle, color: "text-[var(--warning)]" },
  { label: "Reported Questions", value: "7", icon: Flag, color: "text-[var(--destructive)]" },
  { label: "Pending Comments", value: "23", icon: MessageSquare, color: "text-[var(--warning)]" },
  { label: "Contributions", value: "5", icon: Users, color: "text-[var(--primary)]" },
];

const quality = [
  { label: "Missing explanations", value: 48, severity: "warning" },
  { label: "Missing topics", value: 120, severity: "warning" },
  { label: "Flagged for review", value: 14, severity: "error" },
  { label: "Possible duplicates", value: 6, severity: "error" },
];

function AdminDashboard() {
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <Icon className={`w-5 h-5 mb-2 ${color}`} aria-hidden="true" />
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Content Quality */}
      <section aria-labelledby="quality-heading">
        <h2 id="quality-heading" className="font-semibold mb-3">Content Quality</h2>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] divide-y divide-[var(--border)]">
          {quality.map(({ label, value, severity }) => (
            <div key={label} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-[var(--muted-foreground)]">{label}</span>
              <span className={`text-sm font-semibold ${severity === "error" ? "text-[var(--destructive)]" : "text-[var(--warning)]"}`}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          {[
            { to: "/admin/contributions", label: "Review Contributions" },
            { to: "/admin/comments", label: "Moderate Comments" },
            { to: "/admin/reports", label: "Resolve Reports" },
            { to: "/admin/question-sets", label: "Manage Question Sets" },
          ].map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="px-4 py-2 text-sm border border-[var(--border)] rounded-lg hover:bg-[var(--secondary)] transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
