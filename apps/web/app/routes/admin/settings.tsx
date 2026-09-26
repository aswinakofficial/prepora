import {
  WIPE_DATABASE_CONFIRMATION_PHRASE,
  WIPE_DATABASE_KEEP_TABLES,
} from "@prepora/api/src/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle, Database, ShieldAlert, ToggleRight } from "lucide-react";
import React, { useState } from "react";
import { orpc } from "../../../lib/orpc";
import { verifyAdminFn } from "../admin";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: async () => {
    const res = await verifyAdminFn();
    if (!res.ok) throw new Error("Unauthorized");
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { data: stats } = useQuery(orpc.admin.getDatabaseStats.queryOptions());
  const { mutateAsync: wipeDatabase } = useMutation(orpc.admin.wipeDatabase.mutationOptions());
  const [isWiping, setIsWiping] = useState(false);
  const [wipeStatus, setWipeStatus] = useState<"idle" | "success" | "error">("idle");
  const [wipeErrorMsg, setWipeErrorMsg] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  // Local state for UI responsiveness
  const [localStats, setLocalStats] = useState({
    scrapedBatches: 0,
    liveQuestions: 0,
    options: 0,
  });

  React.useEffect(() => {
    if (stats && wipeStatus !== "success") {
      setLocalStats(stats);
    }
  }, [stats, wipeStatus]);

  const handleWipeDatabase = async () => {
    try {
      setIsWiping(true);
      setWipeStatus("idle");
      setWipeErrorMsg(null);

      const result = await wipeDatabase({ confirmation: confirmText });

      if (result.success) {
        setWipeStatus("success");
        setLocalStats({ scrapedBatches: 0, liveQuestions: 0, options: 0 });
        setShowConfirm(false);
        setConfirmText("");
        queryClient.invalidateQueries();
      }
    } catch (err: any) {
      console.error(err);
      setWipeStatus("error");
      setWipeErrorMsg(err?.message || "Check server logs for details.");
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      {/* Top Navigation */}
      <div className="px-6 pt-10 flex justify-between items-center max-w-[1400px] mx-auto mb-12">
        <Link
          to="/admin"
          className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-2"
        >
          ← BACK TO ADMIN OVERVIEW
        </Link>
      </div>

      <main className="max-w-[1400px] mx-auto px-6">
        {/* Page Header */}
        <div className="mb-12 border-b border-slate-800 pb-8">
          <div className="flex items-center gap-3 mb-4">
            <span className="bg-slate-900 border border-slate-800 p-2 rounded-xl">
              <Database className="w-5 h-5 text-slate-300" />
            </span>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-widest text-blue-500 font-semibold mb-1">
                SYSTEM CONFIGURATION
              </span>
              <h1 className="text-4xl text-white font-medium tracking-tight">Database Settings</h1>
            </div>
          </div>
          <p className="font-mono text-xs text-slate-500 max-w-2xl mt-4">
            Manage your Prepora foundational data. Changes made here bypass the review queues and
            directly mutate production tables. Proceed with caution.
          </p>
        </div>

        {/* Database Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">
              Total Live Questions
            </p>
            <p className="text-3xl text-white font-mono">{localStats.liveQuestions}</p>
          </div>
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">
              Total Extracted Options
            </p>
            <p className="text-3xl text-slate-300 font-mono">{localStats.options}</p>
          </div>
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">
              Crawled Batches (Pending)
            </p>
            <p className="text-3xl text-blue-400 font-mono">{localStats.scrapedBatches}</p>
          </div>
        </div>

        {/* Feature flags — defined in packages/api/src/lib/feature-flags.ts */}
        <FeatureFlagsSection />

        {/* Danger Zone Section */}
        <section className="border border-rose-950 bg-rose-950/10 max-w-4xl pt-2">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-rose-950/50">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <h2 className="font-mono text-xs text-rose-500 uppercase tracking-widest font-semibold">
              Danger Zone
            </h2>
          </div>

          <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-start justify-between gap-10">
            <div className="max-w-md">
              <h3 className="text-xl text-white font-medium mb-3">Wipe entire database</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6 font-mono">
                Permanently deletes every table except user sign-in and core configuration: the
                review queue, published questions, the exam catalog, users' practice history,
                bookmarks and comments, pipeline jobs, analytics and the audit log.
                <br />
                <br />
                Kept: {WIPE_DATABASE_KEEP_TABLES.join(", ")}. Everyone stays signed in, and you can
                scrape, approve and publish again straight away.
                <strong className="block mt-4 text-rose-400">This action cannot be undone.</strong>
              </p>
            </div>

            <div className="flex-shrink-0 flex flex-col items-end">
              {!showConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowConfirm(true)}
                  className="px-6 py-3 border border-rose-800/50 text-rose-300 bg-rose-950/20 hover:bg-rose-900/40 hover:text-white font-mono text-xs uppercase tracking-widest transition-all"
                >
                  Clear Database...
                </button>
              ) : (
                <div className="p-5 border border-rose-900/60 bg-[#0f0505] shadow-2xl space-y-4 w-full md:w-80">
                  <div className="flex items-start gap-3 text-rose-400 font-mono text-xs">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <p>
                      Are you absolutely sure? Everything except user accounts and configuration
                      will be permanently erased.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <p className="font-mono text-[10px] text-slate-500 uppercase tracking-wider">
                      Type{" "}
                      <span className="text-rose-400 font-semibold">
                        {WIPE_DATABASE_CONFIRMATION_PHRASE}
                      </span>{" "}
                      to confirm
                    </p>
                    <input
                      type="text"
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={WIPE_DATABASE_CONFIRMATION_PHRASE}
                      autoComplete="off"
                      className="w-full bg-slate-900 border border-rose-900/50 focus:border-rose-500 font-mono text-xs text-slate-200 px-3 py-2 outline-none transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setShowConfirm(false);
                        setConfirmText("");
                      }}
                      className="px-3 py-2 border border-slate-700 bg-slate-800 text-slate-300 font-mono text-[10px] uppercase tracking-wider hover:bg-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleWipeDatabase}
                      disabled={isWiping || confirmText !== WIPE_DATABASE_CONFIRMATION_PHRASE}
                      className="px-3 py-2 bg-rose-600 text-white font-mono text-[10px] uppercase tracking-wider hover:bg-rose-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isWiping ? "Erasing..." : "Yes, Wipe It"}
                    </button>
                  </div>
                </div>
              )}

              {wipeStatus === "success" && (
                <div className="mt-4 flex items-center gap-2 text-emerald-400 font-mono text-xs animate-in fade-in slide-in-from-bottom-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Database wiped. User accounts and configuration were kept.</span>
                </div>
              )}
              {wipeStatus === "error" && (
                <div className="mt-4 flex items-start gap-2 text-rose-400 font-mono text-xs max-w-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{wipeErrorMsg || "Error wiping database. Check logs."}</span>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureFlagsSection() {
  const queryClient = useQueryClient();
  const { data: flags, isLoading } = useQuery(orpc.admin.listFeatureFlags.queryOptions());
  const { mutateAsync: setFeatureFlag } = useMutation(orpc.admin.setFeatureFlag.mutationOptions());
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: string, enabled: boolean) => {
    setSavingKey(key);
    setError(null);
    try {
      await setFeatureFlag({ key, enabled });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: orpc.admin.listFeatureFlags.queryKey() }),
        // The public flag state every page reads (hooks/useFeatureFlag.ts).
        queryClient.invalidateQueries({ queryKey: orpc.featureFlags.list.queryKey() }),
      ]);
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : undefined) || "Couldn't update the feature flag.",
      );
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="border border-slate-800 bg-slate-950/40 max-w-4xl mb-12">
      <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-800">
        <ToggleRight className="w-4 h-4 text-sky-400" />
        <h2 className="font-mono text-xs text-sky-400 uppercase tracking-widest font-semibold">
          Feature Flags
        </h2>
      </div>
      <div className="divide-y divide-slate-900">
        {isLoading
          ? [1].map((n) => (
              <div key={n} className="p-6 flex items-center justify-between gap-6 animate-pulse">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-40 rounded bg-slate-800/80" />
                  <div className="h-3 w-full max-w-lg rounded bg-slate-800/60" />
                </div>
                <div className="h-6 w-11 rounded-full bg-slate-800/80" />
              </div>
            ))
          : (flags ?? []).map((flag) => {
              const saving = savingKey === flag.key;
              return (
                <div
                  key={flag.key}
                  className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-white font-medium">{flag.label}</span>
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest ${
                          flag.enabled ? "text-emerald-400" : "text-slate-500"
                        }`}
                      >
                        {flag.enabled ? "On" : "Off"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed max-w-xl">
                      {flag.description}
                    </p>
                    <p
                      className="font-mono text-[10px] text-slate-600 mt-2"
                      suppressHydrationWarning
                    >
                      Default: {flag.defaultEnabled ? "on" : "off"}
                      {flag.updatedAt
                        ? ` · last changed ${new Date(flag.updatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flag.enabled}
                    aria-label={`${flag.label}: ${flag.enabled ? "on" : "off"}`}
                    disabled={saving}
                    onClick={() => toggle(flag.key, !flag.enabled)}
                    className={`relative shrink-0 w-11 h-6 rounded-full border transition-colors disabled:opacity-50 ${
                      flag.enabled
                        ? "bg-emerald-600 border-emerald-500"
                        : "bg-slate-800 border-slate-700"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white transition-transform ${
                        flag.enabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>
              );
            })}
      </div>
      {error && <p className="px-6 pb-4 font-mono text-xs text-rose-400">{error}</p>}
    </section>
  );
}
