import React from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import {
  LayoutDashboard, FileText, BookOpen, Tag, Users, MessageSquare,
  Flag, BarChart2, Settings, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/exams", label: "Exams", icon: BookOpen },
  { to: "/admin/question-sets", label: "Question Sets", icon: FileText },
  { to: "/admin/questions", label: "Questions", icon: FileText },
  { to: "/admin/contributions", label: "Contributions", icon: Users },
  { to: "/admin/comments", label: "Comments", icon: MessageSquare },
  { to: "/admin/reports", label: "Reports", icon: Flag },
  { to: "/admin/analytics", label: "Analytics", icon: BarChart2 },
];

function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 border-r border-[var(--border)] bg-[var(--card)] hidden md:block" role="navigation" aria-label="Admin navigation">
        <div className="p-4 border-b border-[var(--border)]">
          <span className="font-bold text-sm">⚙️ Admin</span>
        </div>
        <nav className="p-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors mb-0.5"
              activeProps={{ className: "text-[var(--primary)] bg-[var(--secondary)]" }}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
