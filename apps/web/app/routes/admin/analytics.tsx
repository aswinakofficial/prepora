import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, MousePointerClick, Search, TrendingDown } from "lucide-react";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/admin/analytics")({
  head: () => ({ meta: [{ title: "Product Analytics — Admin — Prepora" }] }),
  component: AdminAnalyticsPage,
});

// docs/roadmap/engineering-roadmap.md item 27: analyticsEvents was dead schema with no reader
// anywhere — this is the first real admin view of it. Every number here comes from
// analytics.getSummary (event counts, search failure rate, practice funnel, top viewed
// questions) — no placeholder stats.

function AdminAnalyticsPage() {
  const { data, isLoading, isError, error } = useQuery(
    orpc.analytics.getSummary.queryOptions({ input: { sinceDays: 30 } }),
  );

  if (isLoading) {
    return (
      <div className="p-12 text-slate-400 font-mono text-center flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="w-6 h-6 border-2 border-slate-600 border-t-white rounded-full animate-spin"></div>
        <span>Loading analytics...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-12 font-mono text-center flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <div className="text-red-500 font-bold text-lg uppercase tracking-widest">
          ⚠️ Analytics Data Error
        </div>
        <p className="text-slate-400 text-xs max-w-md leading-relaxed">
          {error?.message || "Failed to load analytics summary from the server."}
        </p>
      </div>
    );
  }

  const totalEvents = data.eventCounts.reduce((sum, e) => sum + e.count, 0);

  return (
    <div className="p-8 md:p-12 lg:p-16 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-16 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-900 pb-12">
        <div className="max-w-2xl">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-normal tracking-tighter text-white mb-6 leading-tight uppercase">
            Product Analytics
          </h1>
          <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
            What gets used, which searches fail, and where students drop out — last {data.sinceDays}{" "}
            days.
          </p>
        </div>
      </div>

      {/* Top Stat Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
        <div className="p-6 border border-slate-900 bg-slate-950/40">
          <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-3 flex items-center justify-between">
            <span>Total Events</span>
            <Activity className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div className="text-3xl text-white font-light tracking-tight">{totalEvents}</div>
        </div>

        <div className="p-6 border border-slate-900 bg-slate-950/40">
          <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-3 flex items-center justify-between">
            <span>Search Failure Rate</span>
            <Search className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div className="text-3xl text-amber-400 font-light tracking-tight">
            {Math.round(data.searchFailures.zeroResultRate * 100)}%
          </div>
          <div className="font-mono text-[10px] text-slate-500 mt-2 tracking-wider">
            {data.searchFailures.zeroResultSearches} of {data.searchFailures.totalSearches} searches
            returned nothing
          </div>
        </div>

        <div className="p-6 border border-slate-900 bg-slate-950/40">
          <div className="font-mono text-[10px] uppercase text-slate-600 tracking-widest mb-3 flex items-center justify-between">
            <span>Practice Completion</span>
            <TrendingDown className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div className="text-3xl text-white font-light tracking-tight">
            {Math.round(data.practiceFunnel.completionRate * 100)}%
          </div>
          <div className="font-mono text-[10px] text-slate-500 mt-2 tracking-wider">
            {data.practiceFunnel.completed} of {data.practiceFunnel.started} sessions finished
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
        {/* Events by Type */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-8 border-b border-slate-900 pb-2">
            Events by Type
          </h2>
          {data.eventCounts.length === 0 ? (
            <p className="font-mono text-sm text-slate-500">No events recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {data.eventCounts.map((e) => (
                <div key={e.event} className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span className="uppercase tracking-wider">{e.event.replace(/_/g, " ")}</span>
                    <span className="text-slate-500">{e.count}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-900 overflow-hidden">
                    <div
                      className="h-full bg-slate-300"
                      style={{
                        width: totalEvents > 0 ? `${(e.count / totalEvents) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Top Viewed Questions */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-500 mb-8 border-b border-slate-900 pb-2 flex items-center justify-between">
            <span>Top Viewed Questions</span>
            <MousePointerClick className="w-3.5 h-3.5 text-slate-600" />
          </h2>
          {data.topQuestions.length === 0 ? (
            <p className="font-mono text-sm text-slate-500">No question views recorded yet.</p>
          ) : (
            <div className="border-t border-slate-900 divide-y divide-slate-900/60">
              {data.topQuestions.map((q, idx) => (
                <div
                  key={q.entityId}
                  className="py-4 flex items-center justify-between gap-4 font-mono text-xs"
                >
                  <span className="text-slate-500 shrink-0 w-6">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-slate-300 truncate flex-1">{q.entityId}</span>
                  <span className="text-slate-500 shrink-0">{q.count} views</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
