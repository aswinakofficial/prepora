import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, BookOpen, FileText, Flag, MessageSquare, Users } from "lucide-react";
import React from "react";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Admin Dashboard — Prepora" }] }),
  component: AdminDashboard,
});

const quality = [
  { label: "Missing explanations", value: 0, severity: "warning" },
  { label: "Missing topics", value: 0, severity: "warning" },
  { label: "Flagged for review", value: 0, severity: "error" },
  { label: "Possible duplicates", value: 0, severity: "error" },
];

function AdminDashboard() {
  const {
    data: statsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery(orpc.admin.getDashboardStats.queryOptions());

  React.useEffect(() => {
    if (isError) {
      console.error("[ADMIN DASHBOARD ERROR] Failed to fetch statsData:", error);
    } else if (statsData) {
      console.log("[ADMIN DASHBOARD DATA] Received statsData:", statsData);
    }
  }, [isError, error, statsData]);

  if (isLoading) {
    return (
      <div className="p-12 text-slate-400 font-mono text-center flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin"></div>
        <span>Loading Control Center...</span>
      </div>
    );
  }

  if (isError || !statsData) {
    return (
      <div className="p-12 font-mono text-center flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="text-red-500 font-bold text-lg uppercase tracking-widest">
          ⚠️ Control Center Data Error
        </div>
        <p className="text-slate-400 text-xs max-w-md leading-relaxed">
          {error?.message || "Failed to load dashboard statistics from the server."}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-4 px-6 py-2 border border-slate-700 bg-slate-900 hover:bg-slate-800 text-white text-xs uppercase tracking-widest transition-colors"
        >
          Retry Load
        </button>
      </div>
    );
  }

  const dynamicStats = [
    {
      label: "Published Questions",
      value: statsData.publishedQs,
      icon: FileText,
      color: "text-white",
    },
    { label: "Question Sets", value: statsData.sets, icon: BookOpen, color: "text-slate-400" },
    {
      label: "Pending Review",
      value: statsData.pending,
      icon: AlertTriangle,
      color: "text-amber-500",
    },
    { label: "Reported Questions", value: "0", icon: Flag, color: "text-red-500" },
    { label: "Pending Comments", value: "0", icon: MessageSquare, color: "text-slate-400" },
    { label: "Registered Users", value: statsData.users, icon: Users, color: "text-blue-400" },
  ];

  return (
    <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-900 pb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight uppercase">
            Control Center
          </h1>
          <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
            Global system analytics and pending topological operations.
          </p>
        </div>
        <div className="font-mono text-[10px] text-slate-600 tracking-widest uppercase text-right shrink-0">
          TOTAL ASSETS <br />
          {statsData.publishedQs + statsData.sets} ENUMERATED
        </div>
      </div>

      {/* Stats Grid Matrix */}
      <section className="mb-24">
        <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
          {/* Global Metrics */}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-900 border-t-2 border-b-2 border-slate-900">
          {dynamicStats.map(({ label, value, icon: Icon, color }, idx) => (
            <div
              key={label}
              className="bg-[#06080a] p-8 md:p-10 border border-slate-900/50 hover:bg-slate-900/30 transition-colors group"
            >
              <div className="flex items-center justify-between mb-16">
                <Icon
                  className={`w-6 h-6 ${color} opacity-80 group-hover:opacity-100 transition-opacity`}
                  aria-hidden="true"
                />
                <span className="font-mono text-[10px] text-slate-700 tracking-widest uppercase">
                  MTRX {String(idx + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="mt-auto">
                <div className="text-4xl font-light text-white tracking-tighter mb-4">{value}</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Quality Audit Log */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
            {/* Intelligence Audit */}
          </h2>
          <div className="border border-slate-900 bg-[#06080a]">
            {quality.map(({ label, value, severity }, idx) => (
              <div
                key={label}
                className="flex items-center justify-between p-6 border-b border-slate-900/50 hover:bg-slate-900/20 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <span className="font-mono text-[10px] text-slate-600 w-8">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-light text-slate-300">{label}</span>
                </div>
                <div className="flex items-center gap-4 font-mono text-[10px] tracking-widest uppercase">
                  <span className={`${severity === "error" ? "text-red-500" : "text-amber-500"}`}>
                    {value} FAULTS
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Action Panel */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
            {/* Rapid Deployment */}
          </h2>
          <div className="flex flex-col border-t border-slate-900">
            {[
              { to: "/admin/contributions", label: "Review Contributions", code: "ACT.01" },
              { to: "/admin/comments", label: "Moderate Comments", code: "ACT.02" },
              { to: "/admin/reports", label: "Resolve Reports", code: "ACT.03" },
              { to: "/admin/question-sets", label: "Manage Question Sets", code: "ACT.04" },
              { to: "/admin/scraping", label: "Web Scraper Engine", code: "ACT.05" },
              { to: "/admin/review", label: "Review & Data Cleaning Queue", code: "ACT.06" },
              { to: "/admin/settings", label: "Database Wipe & DANGER Settings", code: "ACT.07" },
            ].map(({ to, label, code }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center justify-between p-6 border-b border-slate-900 hover:border-slate-700 transition-colors group"
              >
                <div className="flex items-center gap-6">
                  <span className="font-mono text-[10px] text-slate-600">{code}</span>
                  <span className="text-lg font-light text-slate-300 group-hover:text-white transition-colors">
                    {label}
                  </span>
                </div>
                <span className="font-mono text-xs text-slate-600 group-hover:text-white transition-colors">
                  EXECUTE →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
