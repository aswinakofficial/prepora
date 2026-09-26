import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Database,
  ExternalLink,
  Globe,
  Layers,
  Lock,
  LogOut,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute("/admin/scraping")({
  head: () => ({ meta: [{ title: "Scraping Pipeline — Admin — Prepora" }] }),
  component: AdminScrapingPage,
});

// Site cards are driven by orpc.admin.listSources (the sources table) instead of a hardcoded
// constant — see docs/roadmap/engineering-roadmap.md item 14. Adding a source is now a
// source.yaml file plus a sync, never a change to this file.
// docs/roadmap/engineering-roadmap.md item 21: source health (last successful crawl, consecutive
// failures, average runtime, error rate) — computed server-side in
// packages/api/src/lib/pipeline-health.ts from sources + pipeline_jobs, not derivable in the UI.
export interface SourceHealth {
  recentJobCount: number;
  recentFailedCount: number;
  errorRate: number | null;
  averageRuntimeMs: number | null;
  degraded: boolean;
}

export interface SiteOption {
  id: string; // the source's registry slug, e.g. "ms-learn"
  name: string;
  domain: string;
  badge: string;
  badgeColor: string;
  description: string;
  defaultUrl: string;
  defaultExam: string;
  defaultSubject: string;
  defaultMode: string;
  engine: string;
  connectorName: string;
  health: SourceHealth;
  lastCrawlAt: string | null;
  lastSuccessfulCrawlAt: string | null;
  consecutiveFailures: number;
  /** Why this source can't be scraped from here (MS Learn outside local development), if so. */
  lockedReason: string | null;
}

const EMPTY_HEALTH: SourceHealth = {
  recentJobCount: 0,
  recentFailedCount: 0,
  errorRate: null,
  averageRuntimeMs: null,
  degraded: false,
};

const EMPTY_SITE: SiteOption = {
  id: "",
  name: "Loading…",
  domain: "",
  badge: "",
  badgeColor: "text-slate-500 border-slate-800 bg-slate-900/40",
  description: "",
  defaultUrl: "",
  defaultExam: "Auto-detect",
  defaultSubject: "Auto-detect",
  defaultMode: "mcq",
  lockedReason: null,
  engine: "",
  connectorName: "",
  health: EMPTY_HEALTH,
  lastCrawlAt: null,
  lastSuccessfulCrawlAt: null,
  consecutiveFailures: 0,
};

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function toSiteOption(source: {
  name: string;
  baseUrl: string;
  sourceType: string | null;
  connectorName: string;
  requiresAuth: boolean;
  health: SourceHealth;
  lastCrawlAt: string | Date | null;
  lastSuccessfulCrawlAt: string | Date | null;
  consecutiveFailures: number;
  lockedReason?: string | null;
}): SiteOption {
  let domain = source.baseUrl;
  try {
    domain = new URL(source.baseUrl).hostname;
  } catch {
    // baseUrl wasn't a parseable URL — fall back to showing it verbatim.
  }
  return {
    id: source.name,
    name: humanizeSlug(source.name),
    domain,
    badge: source.requiresAuth ? "AUTH REQUIRED" : "OPEN ACCESS",
    badgeColor: source.requiresAuth
      ? "text-sky-400 border-sky-900/80 bg-sky-950/40"
      : "text-emerald-400 border-emerald-900/80 bg-emerald-950/40",
    description: `${source.sourceType ? humanizeSlug(source.sourceType) : "External"} source, handled by the ${source.connectorName} connector.`,
    defaultUrl: source.baseUrl,
    health: source.health,
    lastCrawlAt: source.lastCrawlAt ? new Date(source.lastCrawlAt).toISOString() : null,
    lastSuccessfulCrawlAt: source.lastSuccessfulCrawlAt
      ? new Date(source.lastSuccessfulCrawlAt).toISOString()
      : null,
    consecutiveFailures: source.consecutiveFailures,
    defaultExam: "Auto-detect",
    defaultSubject: "Auto-detect",
    defaultMode: "mcq",
    engine: source.connectorName,
    connectorName: source.connectorName,
    lockedReason: source.lockedReason ?? null,
  };
}

function AdminScrapingPage() {
  const { data: routeData, refetch } = useQuery(orpc.admin.getScrapedQuestions.queryOptions());
  const { mutateAsync: triggerScrapeJobFn } = useMutation(
    orpc.admin.triggerScrapeJob.mutationOptions(),
  );
  const { mutateAsync: fetchMsCatalogFn } = useMutation(
    orpc.admin.getMsLearnCatalog.mutationOptions(),
  );
  const { mutateAsync: triggerMsLearnAuthFn } = useMutation(
    orpc.admin.triggerMsLearnAuth.mutationOptions(),
  );
  const {
    data: msAuthStatusData,
    error: msAuthStatusError,
    refetch: refetchMsAuthStatus,
  } = useQuery({
    ...orpc.admin.getMsLearnAuthStatus.queryOptions(),
    refetchInterval: 15000,
  });
  const { mutateAsync: signOutMsLearnAuthFn, isPending: isSigningOutMs } = useMutation(
    orpc.admin.signOutMsLearnAuth.mutationOptions(),
  );
  const { data: healthData } = useQuery({
    ...orpc.admin.getScraperHealth.queryOptions(),
    refetchInterval: 15000,
  });
  // Set outside local development: the whole scraping engine is locked there, and the API never
  // calls the scraper (packages/api/src/lib/scraping-lock.ts).
  const scrapingLockedReason = healthData?.status === "locked" ? healthData.reason : null;
  const initialQuestions = routeData || [];
  const [questions, setQuestions] = useState(initialQuestions);

  // Registered sources — the site-selector cards, sourced from the sources table (item 14).
  // Disabled sources are never offered: the allowlist and the UI derive from the same registry.
  const { data: sourcesData } = useQuery(orpc.admin.listSources.queryOptions());
  const sites: SiteOption[] = (sourcesData || []).filter((s) => s.enabled).map(toSiteOption);

  // Selected Target Website State
  const [selectedWebsiteId, setSelectedWebsiteId] = useState<string | null>(null);
  const selectedWebsite = sites.find((s) => s.id === selectedWebsiteId) || sites[0] || EMPTY_SITE;

  // Microsoft Learn Catalog & Auth State
  const [msCatalog, setMsCatalog] = useState<any[]>([]);
  const [selectedCatalogUrls, setSelectedCatalogUrls] = useState<string[]>([]);
  const [isFetchingCatalog, setIsFetchingCatalog] = useState(false);
  const [isAuthenticatingMs, setIsAuthenticatingMs] = useState(false);
  const [msAuthStatus, setMsAuthStatus] = useState<string | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState<string | null>(null);

  // Form Config State
  const [url, setUrl] = useState("");
  const [targetExam, setTargetExam] = useState("Auto-detect");
  const [targetSubject, setTargetSubject] = useState("Auto-detect");
  const [parserMode, setParserMode] = useState("mcq");
  // Both default to "All" (empty) — maximum data; an admin can still enter a number to limit a
  // run. Deduplication on approval makes collecting everything safe (re-scrapes only add what's
  // new). maxExamSets used to default to 10 (or 0, the catalog's length before it loaded) and
  // silently scraped fewer sets than were ticked; maxQuestions capped every run at 50.
  const [maxQuestions, setMaxQuestions] = useState<number | "">("");
  const [maxExamSets, setMaxExamSets] = useState<number | "">("");
  const parseLimit = (value: string): number | "" => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : "";
  };
  const [isHeadless, setIsHeadless] = useState<boolean>(true);

  // Prefill the form from the first registered source once the registry loads — mirrors what
  // TARGET_WEBSITES[0] used to provide synchronously, now sourced from the database instead.
  // …skipping sources locked in this environment (MS Learn in production).
  const firstSite = sites.find((site) => !site.lockedReason);
  useEffect(() => {
    if (!selectedWebsiteId && firstSite) {
      setSelectedWebsiteId(firstSite.id);
      setUrl(firstSite.defaultUrl);
      setParserMode(firstSite.defaultMode);
    }
  }, [firstSite, selectedWebsiteId]);

  // Execution & Telemetry State
  const [isScraping, setIsScraping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [lastExtractionResult, setLastExtractionResult] = useState<any>(null);
  const [logFilter, setLogFilter] = useState<"all" | "selected">("all");

  // Every scrape run — its job status, live progress, per-stage counts, and the review batch it
  // produced — in one table. Polls quickly while anything is queued or running.
  const { data: scrapeRuns, refetch: refetchRuns } = useQuery({
    ...orpc.admin.listScrapeRuns.queryOptions(),
    refetchInterval: (query) =>
      isScraping ||
      query.state.data?.some((run) => run.status === "queued" || run.status === "running")
        ? 1500
        : 5000,
  });

  useEffect(() => {
    setQuestions(routeData || []);
  }, [routeData]);

  const handleFetchMsCatalog = async () => {
    setIsFetchingCatalog(true);
    setErrorMsg(null);
    try {
      const data = await fetchMsCatalogFn({});
      const items = data.catalog || [];
      setMsCatalog(items);
      setSelectedCatalogUrls(items.map((item: any) => item.url));
      setSuccessMsg(`Discovered ${data.catalog_count || 0} Microsoft Learn Practice Assessments!`);
    } catch (err: any) {
      setErrorMsg(`Catalog fetch error: ${err.message}`);
    } finally {
      setIsFetchingCatalog(false);
    }
  };

  const handleBulkScrapeSelected = async () => {
    const itemsToScrape = msCatalog
      .filter((item) => selectedCatalogUrls.includes(item.url))
      .slice(0, maxExamSets || undefined);
    if (itemsToScrape.length === 0) {
      setErrorMsg("Please select at least one exam set from the catalog to scrape.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to scrape ${itemsToScrape.length} selected exam set(s)? This will execute sequential Playwright assessment crawling.`,
      )
    ) {
      return;
    }

    setIsScraping(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    let totalSaved = 0;

    for (let i = 0; i < itemsToScrape.length; i++) {
      const cat = itemsToScrape[i];
      setScrapingProgress(
        `Scraping (${i + 1}/${itemsToScrape.length}): ${cat.exam || cat.title}...`,
      );
      const curJobId = Math.random().toString(36).substring(7);
      try {
        const data = await triggerScrapeJobFn({
          url: cat.url,
          targetExam: `Exam ${cat.exam}`,
          targetSubject: "Microsoft Certification",
          parserMode: "mcq",
          jobId: curJobId,
          maxQuestions: maxQuestions || undefined,
          headless: isHeadless,
        });
        totalSaved += data.extracted_count || 0;
      } catch (err: any) {
        console.error(`Failed to ingest ${cat.exam}`, err);
      }
    }

    setIsScraping(false);
    setScrapingProgress(null);
    setSuccessMsg(
      `Bulk Scraping Completed! Extracted ${totalSaved} total questions across ${itemsToScrape.length} selected exam set(s).`,
    );
    await refetch();
  };

  const handleLaunchMsAuth = async () => {
    setIsAuthenticatingMs(true);
    setMsAuthStatus(
      "Launching Playwright browser... Please log in to Microsoft in the opened browser window.",
    );
    setErrorMsg(null);
    try {
      const data = await triggerMsLearnAuthFn({});
      if (data.authenticated) {
        setMsAuthStatus("Microsoft Account signed in. Session saved for scraping.");
        setSuccessMsg("Microsoft Account authenticated successfully!");
      } else {
        setMsAuthStatus(
          "Login incomplete or timed out. Please click 'Authenticate Microsoft Account' and finish signing in.",
        );
        setErrorMsg("Authentication not completed. Please log in in the opened browser window.");
      }
    } catch (err: any) {
      setMsAuthStatus(`Auth error: ${err.message}`);
    } finally {
      setIsAuthenticatingMs(false);
      await refetchMsAuthStatus();
    }
  };

  const handleSignOutMs = async () => {
    setErrorMsg(null);
    try {
      await signOutMsLearnAuthFn({});
      setMsAuthStatus(null);
      setSuccessMsg("Signed out of Microsoft Learn.");
    } catch (err: any) {
      setErrorMsg(`Sign out failed: ${err.message}`);
    } finally {
      await refetchMsAuthStatus();
    }
  };

  useEffect(() => {
    if (healthData?.status === "online") {
      setBackendStatus("online");
    } else {
      setBackendStatus("offline");
    }
  }, [healthData]);

  const handleSelectWebsite = (site: SiteOption) => {
    if (site.lockedReason) return;
    setSelectedWebsiteId(site.id);
    setUrl(site.defaultUrl);
    setTargetExam("Auto-detect");
    setTargetSubject("Auto-detect");
    setParserMode(site.defaultMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastExtractionResult(null);
  };

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsScraping(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastExtractionResult(null);

    try {
      const jobId = Math.random().toString(36).substring(7);
      const data = await triggerScrapeJobFn({
        url,
        parserMode,
        targetExam,
        targetSubject,
        jobId,
        maxQuestions: maxQuestions || undefined,
        headless: isHeadless,
      });

      setSuccessMsg(data.message || `Successfully scraped ${data.extracted_count || 0} questions.`);
      setLastExtractionResult(data);

      await refetch();
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during scraping.");
    } finally {
      setIsScraping(false);
    }
  };

  const visibleRuns = (scrapeRuns ?? []).filter(
    (run) =>
      logFilter === "all" ||
      run.sourceId === selectedWebsite.id ||
      run.url?.toLowerCase().includes(selectedWebsite.domain.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      <div className="px-6 pt-10 flex justify-between items-center max-w-[1400px] mx-auto mb-12">
        <Link
          to="/admin"
          className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-2"
        >
          ← BACK TO ADMIN OVERVIEW
        </Link>
        <Link
          to="/admin/review"
          className="font-mono text-xs uppercase tracking-widest text-slate-400 hover:text-white border border-slate-800 hover:border-slate-500 px-4 py-2 transition-all flex items-center gap-2"
        >
          <Database className="w-3.5 h-3.5 text-blue-400" />
          <span>OPEN REVIEW QUEUE →</span>
        </Link>
      </div>

      <main className="max-w-[1400px] mx-auto px-6">
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-16 border-b border-slate-900 pb-4 flex items-center flex-wrap gap-y-2">
          <Link to="/" className="hover:text-white transition-colors">
            ROOT
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/admin" className="hover:text-white transition-colors">
            ADMIN
          </Link>
          <span className="mx-4 text-slate-700">/</span>
          <span className="text-white">SCRAPING PIPELINE</span>
        </div>

        <div className="mb-16 border-b border-slate-800 pb-12">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div>
              <div className="font-mono text-xs tracking-[0.3em] text-blue-400 uppercase mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                <span>TARGET-SPECIFIC INGESTION ENGINE</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-normal tracking-tighter text-white uppercase mb-4 leading-tight">
                WEBSITE SCRAPER DIRECTORY
              </h1>
              <p className="font-mono text-xs tracking-widest text-slate-400 uppercase leading-relaxed max-w-2xl">
                Select a target exam website below to configure custom site handlers, trigger
                extraction jobs, and monitor status.
              </p>
            </div>

            <div className="font-mono text-xs text-slate-400 border border-slate-900 bg-slate-950 p-4 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-6 text-[11px] uppercase tracking-wider">
                <span className="text-slate-500">FASTAPI SERVICE:</span>
                <span
                  className={`flex items-center gap-1.5 font-semibold ${
                    healthData?.status === "online"
                      ? "text-emerald-400"
                      : healthData?.status === "misconfigured"
                        ? "text-rose-400"
                        : "text-amber-400"
                  }`}
                >
                  {scrapingLockedReason ? (
                    <Lock className="w-3 h-3" />
                  ) : (
                    <span
                      className={`w-2 h-2 rounded-full ${healthData?.status === "online" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}
                    ></span>
                  )}
                  {healthData?.status === "online"
                    ? "ONLINE"
                    : healthData?.status === "misconfigured"
                      ? "MISCONFIGURED"
                      : scrapingLockedReason
                        ? "LOCKED · LOCAL ONLY"
                        : "OFFLINE"}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 truncate max-w-[280px]">
                {healthData?.status === "misconfigured" || healthData?.status === "offline"
                  ? healthData.reason
                  : scrapingLockedReason
                    ? "Not called from this environment."
                    : "Address and credential are configured server-side (SCRAPER_SERVICE_URL)."}
              </div>
            </div>
          </div>
        </div>

        {scrapingLockedReason && (
          <div
            role="status"
            className="mb-12 flex items-start gap-3 border border-amber-900/60 bg-amber-950/30 p-5 font-mono text-xs text-amber-200"
          >
            <Lock className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-1.5 leading-relaxed">
              <p className="uppercase tracking-widest text-amber-300">
                Scraping is locked in this environment
              </p>
              <p>{scrapingLockedReason}</p>
              <p className="text-amber-200/70">
                Run scrapes from a local development setup (pnpm dev). Scraped batches reach the
                review queue there, and published questions appear here. Past runs are listed below.
              </p>
            </div>
          </div>
        )}

        <section className="mb-16">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span>01 / Select Target Website for Scraping</span>
            </h2>
            <span className="font-mono text-[10px] text-slate-500 uppercase">
              {sites.length} Registered Web Adapters
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {sites.map((site) => {
              const isSelected = selectedWebsite.id === site.id;
              const isLocked = !!site.lockedReason;

              return (
                <button
                  key={site.id}
                  type="button"
                  onClick={() => handleSelectWebsite(site)}
                  disabled={isLocked}
                  title={site.lockedReason ?? undefined}
                  className={`p-6 border transition-all relative group flex flex-col justify-between text-left w-full ${
                    isLocked
                      ? "border-slate-900 bg-slate-950/40 opacity-60 cursor-not-allowed"
                      : isSelected
                        ? "cursor-pointer border-blue-500 bg-blue-950/20 shadow-lg shadow-blue-950/40"
                        : "cursor-pointer border-slate-900 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/30"
                  }`}
                >
                  {isLocked && (
                    <div className="mb-4 flex items-start gap-2 font-mono text-[10px] text-amber-300 border border-amber-900/60 bg-amber-950/30 px-2.5 py-2">
                      <Lock className="w-3.5 h-3.5 shrink-0 mt-px" />
                      {/* The banner above explains why; each card just carries the marker. */}
                      <span className="uppercase tracking-widest">Local only</span>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${site.badgeColor}`}
                      >
                        {site.badge}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 truncate">
                        {site.domain}
                      </span>
                    </div>

                    <h3
                      className={`text-xl font-medium tracking-tight mb-2 transition-colors ${
                        isSelected ? "text-white" : "text-slate-200 group-hover:text-white"
                      }`}
                    >
                      {site.name}
                    </h3>

                    <p className="font-mono text-xs text-slate-400 leading-relaxed mb-6">
                      {site.description}
                    </p>

                    <div className="flex items-center gap-2 mb-4">
                      <span
                        className={`font-mono text-[10px] uppercase tracking-widest px-2 py-0.5 border ${
                          site.health.degraded
                            ? "text-rose-400 border-rose-900/80 bg-rose-950/40"
                            : "text-emerald-400 border-emerald-900/80 bg-emerald-950/40"
                        }`}
                      >
                        {site.health.degraded ? "DEGRADED" : "HEALTHY"}
                      </span>
                      {site.consecutiveFailures > 0 && (
                        <span className="font-mono text-[10px] text-amber-400">
                          {site.consecutiveFailures} consecutive failure
                          {site.consecutiveFailures === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-900/80 flex items-center justify-between font-mono text-xs">
                    <span className="text-[11px] text-slate-500 uppercase truncate">
                      {site.engine}
                    </span>
                    <span
                      className={`flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wider ${
                        isSelected ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                      }`}
                    >
                      {isSelected ? "ACTIVE CONFIG" : "SELECT SITE"}
                      <ChevronRight
                        className={`w-3.5 h-3.5 ${isSelected ? "text-blue-400" : "text-slate-600"}`}
                      />
                    </span>
                  </div>

                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Configuration and triggers exist only where scraping can actually run. */}
        {!scrapingLockedReason && (
          <section className="mb-20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>
                  02 / Configure Scraper for:{" "}
                  <span className="text-white font-semibold">{selectedWebsite.name}</span>
                </span>
              </h2>
              <span className="font-mono text-[10px] text-slate-500 uppercase">
                Engine: {selectedWebsite.engine}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8 p-8 border border-slate-800 bg-slate-950/90 relative">
                <div className="flex items-center justify-between border-b border-slate-900 pb-4 mb-6">
                  <div>
                    <h3 className="text-lg font-medium text-white tracking-tight">
                      {selectedWebsite.name} Ingestion Settings
                    </h3>
                    <p className="font-mono text-xs text-slate-500">
                      Customize target URL, exam discipline, and extraction strategy for{" "}
                      {selectedWebsite.domain}
                    </p>
                  </div>
                  <span
                    className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${selectedWebsite.badgeColor}`}
                  >
                    {selectedWebsite.badge}
                  </span>
                </div>

                {selectedWebsite.connectorName === "mslearn" && (
                  <div className="p-5 border border-sky-900/60 bg-sky-950/20 mb-8 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-sky-400" />
                          Microsoft Learn Session & Catalog Manager
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Microsoft Learn practice tests require an active authenticated Microsoft
                          account session.
                        </p>
                      </div>
                      {msAuthStatusData?.authenticated ? (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-2 bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono text-xs uppercase tracking-wider flex items-center gap-2">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Already Authenticated
                          </span>
                          <button
                            type="button"
                            onClick={handleSignOutMs}
                            disabled={isSigningOutMs}
                            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs uppercase tracking-wider border border-slate-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                          >
                            <LogOut className="w-3.5 h-3.5" />
                            Sign Out
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleLaunchMsAuth}
                          disabled={isAuthenticatingMs}
                          className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${isAuthenticatingMs ? "animate-spin" : ""}`}
                          />
                          {isAuthenticatingMs
                            ? "Authenticating..."
                            : "Authenticate Microsoft Account"}
                        </button>
                      )}
                    </div>

                    {msAuthStatus && (
                      <div className="p-3 bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300">
                        {msAuthStatus}
                      </div>
                    )}

                    {msAuthStatusError && (
                      <div className="p-3 bg-red-950/40 border border-red-900 text-xs font-mono text-red-300">
                        Could not check Microsoft Learn session status: {msAuthStatusError.message}
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-mono">
                        Discover practice tests from official Microsoft Learn catalog
                      </span>
                      <button
                        type="button"
                        onClick={handleFetchMsCatalog}
                        disabled={isFetchingCatalog}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs uppercase tracking-wider border border-slate-700 transition-colors flex items-center gap-1.5"
                      >
                        <Search className="w-3 h-3 text-slate-400" />
                        {isFetchingCatalog ? "Scanning Catalog..." : "Scan Practice Catalog"}
                      </button>
                    </div>

                    {msCatalog.length > 0 && (
                      <div className="mt-4 space-y-3 pt-3 border-t border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <p className="text-[11px] font-mono text-slate-300 uppercase tracking-widest font-semibold">
                              Discovered Assessments ({msCatalog.length}):
                            </p>
                            <span className="px-2.5 py-0.5 bg-sky-900/60 text-sky-300 border border-sky-700/60 font-mono text-[10px] uppercase tracking-wider rounded-full">
                              {selectedCatalogUrls.length} of {msCatalog.length} Selected
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              if (selectedCatalogUrls.length === msCatalog.length) {
                                setSelectedCatalogUrls([]);
                              } else {
                                setSelectedCatalogUrls(msCatalog.map((item) => item.url));
                              }
                            }}
                            className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px] uppercase tracking-wider transition-colors flex items-center gap-1.5"
                          >
                            <CheckSquare className="w-3.5 h-3.5 text-sky-400" />
                            {selectedCatalogUrls.length === msCatalog.length
                              ? "Deselect All"
                              : "Select All"}
                          </button>
                        </div>

                        <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                          {msCatalog.map((item) => {
                            const isChecked = selectedCatalogUrls.includes(item.url);
                            return (
                              <div
                                key={item.url}
                                className={`p-3 bg-slate-900 border flex items-center justify-between gap-4 transition-all ${
                                  isChecked
                                    ? "border-sky-500/80 bg-sky-950/40 ring-1 ring-sky-500/30"
                                    : "border-slate-800 hover:border-slate-700 opacity-70"
                                }`}
                              >
                                <label className="flex items-center gap-3 min-w-0 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedCatalogUrls((prev) =>
                                        isChecked
                                          ? prev.filter((u) => u !== item.url)
                                          : [...prev, item.url],
                                      );
                                    }}
                                    className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500/20 bg-slate-950 shrink-0 cursor-pointer"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs text-slate-200 font-medium truncate">
                                      {item.title}
                                    </p>
                                    <p className="text-[10px] font-mono text-slate-400 truncate">
                                      {item.url}
                                    </p>
                                  </div>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUrl(item.url);
                                    setTargetExam(`Exam ${item.exam}`);
                                    setTargetSubject("Microsoft Certification");
                                  }}
                                  className="shrink-0 px-2.5 py-1 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 text-[10px] font-mono uppercase tracking-wider transition-colors"
                                >
                                  Target Single
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-2">
                          <button
                            type="button"
                            disabled={
                              isScraping ||
                              selectedCatalogUrls.length === 0 ||
                              backendStatus === "offline"
                            }
                            onClick={handleBulkScrapeSelected}
                            className="w-full py-3.5 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center justify-center gap-2 border border-sky-400/30 shadow-lg shadow-sky-950/50"
                          >
                            <Layers className="w-4 h-4" />
                            {isScraping
                              ? scrapingProgress || "Scraping Catalog Exam Sets..."
                              : `Scrape Selected Catalog Exam Sets (${selectedCatalogUrls.length} Selected)`}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <form onSubmit={handleScrape} className="space-y-6">
                  {selectedWebsite.connectorName !== "mslearn" && (
                    <div className="space-y-2">
                      <label
                        htmlFor="scraping-target-url"
                        className="font-mono text-xs uppercase tracking-widest text-slate-400 flex items-center justify-between"
                      >
                        <span>
                          TARGET PAGE / EXAM URL <span className="text-rose-400">*</span>
                        </span>
                        <Globe className="w-3.5 h-3.5 text-slate-600" />
                      </label>
                      <input
                        id="scraping-target-url"
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder={`https://${selectedWebsite.domain}/questions/sample`}
                        required={selectedWebsite.connectorName !== "mslearn"}
                        className="w-full bg-slate-900/90 border border-slate-800 focus:border-white outline-none font-mono text-sm text-white px-4 py-3 tracking-tight transition-colors placeholder:text-slate-700"
                      />
                    </div>
                  )}

                  {/* Form fields: TARGET EXAM & SUBJECT auto-detected by scraper engine */}

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
                    <div className="space-y-2">
                      <label
                        htmlFor="scraping-parser-mode"
                        className="font-mono text-xs uppercase tracking-widest text-slate-400"
                      >
                        EXTRACTION STRATEGY
                      </label>
                      <select
                        id="scraping-parser-mode"
                        value={parserMode}
                        onChange={(e) => setParserMode(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-200 px-3 py-3 outline-none uppercase transition-colors"
                      >
                        <option value="mcq">Structured MCQ</option>
                        <option value="paragraph">Paragraph Q&A</option>
                        <option value="auto">Auto-Detect Heuristics</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="scraping-max-sets"
                        className="font-mono text-xs uppercase tracking-widest text-slate-400"
                      >
                        BATCH: MAX SETS
                      </label>
                      <input
                        id="scraping-max-sets"
                        type="number"
                        min={1}
                        max={100}
                        value={maxExamSets}
                        placeholder="All selected"
                        onChange={(e) => setMaxExamSets(parseLimit(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-300 px-3 py-3 outline-none transition-colors"
                      />
                      <p className="font-mono text-[10px] text-slate-500">
                        Leave empty to scrape every selected set.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="scraping-max-questions"
                        className="font-mono text-xs uppercase tracking-widest text-slate-400"
                      >
                        BATCH: MAX Qs
                      </label>
                      <input
                        id="scraping-max-questions"
                        type="number"
                        min={1}
                        max={100}
                        value={maxQuestions}
                        placeholder="All"
                        onChange={(e) => setMaxQuestions(parseLimit(e.target.value))}
                        className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-300 px-3 py-3 outline-none transition-colors"
                      />
                      <p className="font-mono text-[10px] text-slate-500">
                        Leave empty for every question in the assessment.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <span className="font-mono text-xs uppercase tracking-widest text-slate-400 block">
                        BROWSER HEADLESS MODE
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsHeadless(!isHeadless)}
                        className={`w-full py-3 px-3 border font-mono text-xs uppercase tracking-wider flex items-center justify-between transition-all ${
                          isHeadless
                            ? "bg-emerald-950/40 border-emerald-500/80 text-emerald-300"
                            : "bg-amber-950/40 border-amber-500/80 text-amber-300"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${isHeadless ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`}
                          />
                          {isHeadless ? "Headless (Background)" : "GUI Browser (Visible)"}
                        </span>
                        <span className="text-[10px] opacity-75">{isHeadless ? "ON" : "OFF"}</span>
                      </button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-800 flex gap-4">
                    {selectedWebsite.connectorName === "mslearn" ? (
                      <button
                        type="button"
                        disabled={
                          isScraping ||
                          selectedCatalogUrls.length === 0 ||
                          backendStatus === "offline"
                        }
                        onClick={handleBulkScrapeSelected}
                        className="w-full bg-sky-600 text-white hover:bg-sky-500 font-semibold tracking-tight px-6 py-4 flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {isScraping ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <Layers className="w-5 h-5" />
                        )}
                        {isScraping
                          ? scrapingProgress || "Ingesting Selected Catalog Sets..."
                          : `Scrape Selected Catalog Sets (${selectedCatalogUrls.length} Selected)`}
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={isScraping || backendStatus === "offline"}
                        className="w-full bg-white text-black hover:bg-slate-200 font-semibold tracking-tight px-6 py-4 flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase"
                      >
                        {isScraping ? (
                          <RefreshCw className="w-5 h-5 animate-spin" />
                        ) : (
                          <Layers className="w-5 h-5" />
                        )}
                        {isScraping ? "Initiating Payload..." : "Commence Data Ingestion"}
                      </button>
                    )}
                  </div>
                </form>

                {errorMsg && (
                  <div className="mt-6 p-4 border border-rose-900/60 bg-rose-950/40 font-mono text-xs text-rose-300 flex items-center justify-between">
                    <span>ERROR: {errorMsg}</span>
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  </div>
                )}

                {successMsg && lastExtractionResult && (
                  <div className="mt-6 p-6 border border-emerald-900/60 bg-emerald-950/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-mono text-xs text-emerald-400 uppercase tracking-widest">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>{selectedWebsite.name} Job Completed</span>
                      </div>
                      <span className="font-mono text-[10px] text-emerald-500 uppercase border border-emerald-900 px-2 py-0.5">
                        {lastExtractionResult.engine ||
                          lastExtractionResult.mode ||
                          "Ingestion Success"}
                      </span>
                    </div>

                    <p className="font-mono text-sm text-slate-200">{successMsg}</p>

                    <div className="pt-2 flex items-center justify-between">
                      <span className="font-mono text-xs text-slate-500">
                        Record ID: #{lastExtractionResult.dbRecordId || "Saved"}
                      </span>

                      <Link
                        to="/admin/review"
                        className="font-mono text-xs uppercase tracking-widest text-emerald-400 hover:text-white border-b border-emerald-500 pb-0.5 transition-colors flex items-center gap-1"
                      >
                        <span>GO TO REVIEW QUEUE TO APPROVE</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 space-y-6">
                <div className="p-6 border border-slate-900 bg-slate-950/60 space-y-6">
                  <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 border-b border-slate-900 pb-3 flex items-center justify-between">
                    <span>{/* Site Adapter Specs */}</span>
                    <Sliders className="w-3.5 h-3.5 text-slate-600" />
                  </h3>

                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">PORTAL NAME</span>
                      <span className="text-white font-medium">{selectedWebsite.name}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">TARGET DOMAIN</span>
                      <span className="text-blue-400">{selectedWebsite.domain}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">SCRAPE ENGINE</span>
                      <span className="text-emerald-400">{selectedWebsite.engine}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">DB INGESTIONS</span>
                      <span className="text-amber-400">
                        {
                          questions.filter((q: any) =>
                            q.sourceUrl
                              ?.toLowerCase()
                              .includes(selectedWebsite.domain.toLowerCase()),
                          ).length
                        }{" "}
                        Batches
                      </span>
                    </div>
                  </div>
                </div>

                {/* docs/roadmap/engineering-roadmap.md item 21: source health, drawn from
                  sources + pipeline_jobs (packages/api/src/lib/pipeline-health.ts). */}
                <div className="p-6 border border-slate-900 bg-slate-950/60 space-y-4">
                  <h3 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 border-b border-slate-900 pb-3">
                    Source Health
                  </h3>
                  <div className="space-y-4 font-mono text-xs">
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">STATUS</span>
                      <span
                        className={
                          selectedWebsite.health.degraded ? "text-rose-400" : "text-emerald-400"
                        }
                      >
                        {selectedWebsite.health.degraded ? "DEGRADED" : "HEALTHY"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">LAST SUCCESSFUL CRAWL</span>
                      <span className="text-slate-300" suppressHydrationWarning>
                        {selectedWebsite.lastSuccessfulCrawlAt
                          ? new Date(selectedWebsite.lastSuccessfulCrawlAt)
                              .toISOString()
                              .replace("T", " ")
                              .slice(0, 19)
                          : "Never"}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">CONSECUTIVE FAILURES</span>
                      <span
                        className={
                          selectedWebsite.consecutiveFailures > 0
                            ? "text-amber-400"
                            : "text-slate-300"
                        }
                      >
                        {selectedWebsite.consecutiveFailures}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-900/60 pb-2">
                      <span className="text-slate-600">ERROR RATE (30D)</span>
                      <span className="text-slate-300">
                        {selectedWebsite.health.errorRate == null
                          ? "No recent runs"
                          : `${Math.round(selectedWebsite.health.errorRate * 100)}%`}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">AVG RUNTIME</span>
                      <span className="text-slate-300">
                        {selectedWebsite.health.averageRuntimeMs == null
                          ? "—"
                          : `${(selectedWebsite.health.averageRuntimeMs / 1000).toFixed(1)}s`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 border border-slate-900 bg-slate-950/40 space-y-3 font-mono text-xs text-slate-500">
                  <div className="text-slate-300 font-medium uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Adapter Guidelines</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">
                    {selectedWebsite.connectorName === "mslearn"
                      ? "Microsoft Learn uses an interactive Playwright crawler to navigate practice tests, click check answer buttons, and harvest rationale explanations."
                      : selectedWebsite.connectorName === "sanfoundry"
                        ? "Sanfoundry adapter automatically extracts question prompts, multiple choices, and uncollapses hidden answers."
                        : `Target URL parser for ${selectedWebsite.name}. Ensure the link is publicly accessible for extraction.`}
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SECTION 3: SCRAPE RUNS — replaces three panels (a text log, a job table and a batch
            table) that each showed one slice of the same runs. */}
        <section>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-900 pb-4">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>03 / Scrape Runs ({visibleRuns.length})</span>
              </h2>
              <p className="font-mono text-[10px] text-slate-500 uppercase mt-1 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Live — status, progress, stages and review status of each run
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center border border-slate-900 bg-slate-950 p-1 font-mono text-xs">
                {(["all", "selected"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setLogFilter(filter)}
                    className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                      logFilter === filter
                        ? "bg-slate-800 text-white font-semibold"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    {filter === "all" ? "All Sources" : `Only ${selectedWebsite.name}`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => refetchRuns()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-mono text-[10px] uppercase tracking-widest transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>

          <ScrapeRunsTable runs={visibleRuns} />
        </section>
      </main>
    </div>
  );
}

type ScrapeRun = NonNullable<Awaited<ReturnType<typeof orpc.admin.listScrapeRuns.call>>>[number];

const RUN_STATUS_STYLE: Record<string, string> = {
  completed: "bg-emerald-950/40 border-emerald-900/80 text-emerald-400",
  partial: "bg-amber-950/40 border-amber-900/80 text-amber-400",
  failed: "bg-rose-950/40 border-rose-900/80 text-rose-400",
  running: "bg-sky-950/40 border-sky-900/80 text-sky-300",
  queued: "bg-slate-900 border-slate-800 text-slate-400",
};

const BATCH_STATUS_STYLE: Record<string, string> = {
  pending: "text-amber-400",
  approved: "text-emerald-400",
  rejected: "text-rose-400",
};

function formatDuration(ms: number): string {
  const secs = Math.max(0, Math.round(ms / 1000));
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function ScrapeRunsTable({ runs }: { runs: ScrapeRun[] }) {
  return (
    <div className="border border-slate-900 overflow-x-auto bg-slate-950/40">
      <table className="w-full text-left font-mono text-xs">
        <thead className="border-b border-slate-900 bg-slate-900/50 text-slate-500 uppercase tracking-widest text-[10px]">
          <tr>
            <th className="p-4 font-normal">Run</th>
            <th className="p-4 font-normal">Status &amp; stages</th>
            <th className="p-4 font-normal">Questions</th>
            <th className="p-4 font-normal">Review</th>
            <th className="p-4 font-normal">Started / Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900/80 text-slate-300">
          {runs.length === 0 ? (
            <tr>
              <td colSpan={5} className="p-8 text-center text-slate-600">
                No scrape runs yet. Start one above — it appears here immediately and updates live.
              </td>
            </tr>
          ) : (
            runs.map((run) => {
              const active = run.status === "running" || run.status === "queued";
              // The stage still in progress (MS Learn reports processed/discovered as it goes).
              const liveStage = run.stages.find((stage) => stage.status === "running");
              const progress =
                liveStage && liveStage.discoveredCount > 0
                  ? Math.min(1, liveStage.processedCount / liveStage.discoveredCount)
                  : null;
              const started = run.startedAt ? new Date(run.startedAt) : null;
              const ended = run.completedAt ? new Date(run.completedAt) : null;
              const title =
                run.batch?.examTitle || run.batch?.exam || run.targetExam || run.sourceId;
              const questionCount =
                run.batch?.questionCount ??
                run.stages.reduce((max, stage) => Math.max(max, stage.processedCount), 0);

              return (
                <tr key={run.id} className="hover:bg-slate-900/40 transition-colors align-top">
                  <td className="p-4 max-w-[320px]">
                    <div className="flex items-start gap-3">
                      {run.batch?.logoUrl && (
                        <img
                          src={run.batch.logoUrl}
                          alt=""
                          className="w-8 h-8 object-contain shrink-0"
                          loading="lazy"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-slate-200 font-sans text-sm truncate" title={title}>
                          {title}
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          #{run.id.slice(0, 8)} · {run.sourceId}
                        </div>
                        {run.url && (
                          <a
                            href={run.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-slate-500 hover:text-blue-400 flex items-center gap-1 mt-0.5"
                            title={run.url}
                          >
                            <span className="truncate">{run.url}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="p-4 min-w-[280px]">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                        RUN_STATUS_STYLE[run.status] ?? RUN_STATUS_STYLE.queued
                      }`}
                    >
                      {active && <RefreshCw className="w-3 h-3 animate-spin" />}
                      {run.status}
                    </span>
                    {progress != null && liveStage && (
                      <div className="mt-2">
                        <div className="h-1 bg-slate-900 border border-slate-800">
                          <div
                            className="h-full bg-sky-400 transition-all"
                            style={{ width: `${Math.round(progress * 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-sky-300 mt-1">
                          {liveStage.processedCount} / {liveStage.discoveredCount} questions
                        </div>
                      </div>
                    )}
                    <div className="mt-2 space-y-0.5">
                      {run.stages.map((stage) => (
                        <div key={stage.id} className="text-[11px] text-slate-500">
                          <span className="text-slate-300">{stage.stage}</span>{" "}
                          <span
                            className={
                              stage.status === "completed"
                                ? "text-emerald-500"
                                : stage.status === "failed"
                                  ? "text-rose-500"
                                  : "text-amber-500"
                            }
                          >
                            {stage.status}
                          </span>{" "}
                          — processed={stage.processedCount} failed={stage.failedCount} duplicate=
                          {stage.duplicateCount} skipped={stage.skippedCount}
                          {stage.durationMs != null ? ` (${stage.durationMs}ms)` : ""}
                          {stage.errorDetail && (
                            <div className="text-rose-400 whitespace-pre-wrap break-words">
                              {stage.errorDetail}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {run.errorSummary && (
                      <div className="mt-2 text-[11px] text-rose-400 whitespace-pre-wrap break-words">
                        {run.errorSummary}
                      </div>
                    )}
                  </td>

                  <td className="p-4 text-white font-medium whitespace-nowrap">
                    {questionCount} Qs
                  </td>

                  <td className="p-4 whitespace-nowrap">
                    {run.batch ? (
                      <div className="space-y-1">
                        <div
                          className={`uppercase tracking-wider text-[10px] ${
                            BATCH_STATUS_STYLE[run.batch.status] ?? "text-slate-400"
                          }`}
                        >
                          {run.batch.status}
                        </div>
                        {run.batch.status === "pending" && (
                          <Link
                            to="/admin/review"
                            className="text-slate-400 hover:text-white border-b border-slate-700 hover:border-white pb-0.5 transition-colors uppercase tracking-wider text-[10px]"
                          >
                            Review →
                          </Link>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-600 text-[10px]">
                        {active ? "Scraping…" : "No batch"}
                      </span>
                    )}
                  </td>

                  <td
                    className="p-4 text-slate-500 text-[11px] whitespace-nowrap"
                    suppressHydrationWarning
                  >
                    {started ? `${started.toISOString().replace("T", " ").slice(0, 19)} UTC` : "—"}
                    {started && (
                      <div className="text-slate-400 mt-0.5">
                        {formatDuration((ended ?? new Date()).getTime() - started.getTime())}
                        {!ended && active ? " so far" : ""}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
