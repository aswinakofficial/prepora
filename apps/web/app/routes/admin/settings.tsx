import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { 
  ArrowLeft, 
  Trash2,
  AlertTriangle,
  CheckCircle,
  Database,
  ShieldAlert
} from "lucide-react";
import { verifyAdminFn } from "../admin";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/admin/settings")({
  beforeLoad: async () => {
    const res = await verifyAdminFn();
    if (!res.ok) throw new Error("Unauthorized");
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useQuery(orpc.admin.getDatabaseStats.queryOptions());
  const { mutateAsync: wipeDatabase } = useMutation(orpc.admin.wipeDatabase.mutationOptions());
  const [isWiping, setIsWiping] = useState(false);
  const [wipeStatus, setWipeStatus] = useState<"idle" | "success" | "error">("idle");
  const [showConfirm, setShowConfirm] = useState(false);
  
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
      
      const result = await wipeDatabase();
      
      if (result.success) {
        setWipeStatus("success");
        setLocalStats({ scrapedBatches: 0, liveQuestions: 0, options: 0 });
        setShowConfirm(false);
        queryClient.invalidateQueries();
      }
    } catch (err) {
      console.error(err);
      setWipeStatus("error");
    } finally {
      setIsWiping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      
      {/* Top Navigation */}
      <div className="px-6 pt-10 flex justify-between items-center max-w-[1400px] mx-auto mb-12">
        <Link to="/admin" className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-2">
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
              <h1 className="text-4xl text-white font-medium tracking-tight">
                Database Settings
              </h1>
            </div>
          </div>
          <p className="font-mono text-xs text-slate-500 max-w-2xl mt-4">
            Manage your Prepora foundational data. Changes made here bypass the review queues and directly mutate production tables. Proceed with caution.
          </p>
        </div>

        {/* Database Status Panel */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">Total Live Questions</p>
            <p className="text-3xl text-white font-mono">{localStats.liveQuestions}</p>
          </div>
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">Total Extracted Options</p>
            <p className="text-3xl text-slate-300 font-mono">{localStats.options}</p>
          </div>
          <div className="p-6 bg-slate-900/40 border border-slate-800/80">
            <p className="font-mono text-[10px] uppercase text-slate-500 mb-2">Crawled Batches (Pending)</p>
            <p className="text-3xl text-blue-400 font-mono">{localStats.scrapedBatches}</p>
          </div>
        </div>

        {/* Danger Zone Section */}
        <section className="border border-rose-950 bg-rose-950/10 max-w-4xl pt-2">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-rose-950/50">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <h2 className="font-mono text-xs text-rose-500 uppercase tracking-widest font-semibold">Danger Zone</h2>
          </div>
          
          <div className="p-8 md:p-10 flex flex-col md:flex-row md:items-start justify-between gap-10">
            <div className="max-w-md">
              <h3 className="text-xl text-white font-medium mb-3">
                Wipe entire database
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-6 font-mono">
                This will permanently delete all crawled batches in the queue, all published questions, all options, and all answers. 
                <br /><br />
                Your application state will be completely reset. You will need to scrape and re-publish data to populate the platform again.
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
                    <p>Are you absolutely sure you want to permanently erase all data?</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      type="button"
                      onClick={() => setShowConfirm(false)}
                      className="px-3 py-2 border border-slate-700 bg-slate-800 text-slate-300 font-mono text-[10px] uppercase tracking-wider hover:bg-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleWipeDatabase}
                      disabled={isWiping}
                      className="px-3 py-2 bg-rose-600 text-white font-mono text-[10px] uppercase tracking-wider hover:bg-rose-500 transition disabled:opacity-50"
                    >
                      {isWiping ? "Erasing..." : "Yes, Wipe It"}
                    </button>
                  </div>
                </div>
              )}
              
              {wipeStatus === "success" && (
                <div className="mt-4 flex items-center gap-2 text-emerald-400 font-mono text-xs animate-in fade-in slide-in-from-bottom-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Database cleanly wiped.</span>
                </div>
              )}
              {wipeStatus === "error" && (
                <div className="mt-4 flex items-center gap-2 text-rose-400 font-mono text-xs">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Error wiping database. Check logs.</span>
                </div>
              )}
            </div>
          </div>
        </section>
        
      </main>
    </div>
  );
}
