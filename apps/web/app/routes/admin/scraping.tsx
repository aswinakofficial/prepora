import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "../../../lib/orpc";
import { 
  Globe, 
  Search, 
  RefreshCw, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  Sliders, 
  Database,
  ExternalLink,
  Sparkles,
  ChevronRight,
  Server,
  Layers,
  Filter,
  CheckSquare,
  Terminal
} from "lucide-react";

export const Route = createFileRoute("/admin/scraping")({
  head: () => ({ meta: [{ title: "Scraping Pipeline — Admin — Prepora" }] }),
  component: AdminScrapingPage,
});

export interface TargetWebsite {
  id: string;
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
}

const TARGET_WEBSITES: TargetWebsite[] = [
  {
    id: "mslearn",
    name: "Microsoft Learn",
    domain: "learn.microsoft.com",
    badge: "PLAYWRIGHT AUTOMATION",
    badgeColor: "text-sky-400 border-sky-900/80 bg-sky-950/40",
    description: "Dynamic assessment crawler for Microsoft Certification Practice Tests (AB-100, AZ-104, etc.)",
    defaultUrl: "https://learn.microsoft.com/en-us/credentials/certifications/exams/ab-100/practice/assessment?assessment-type=practice&assessmentId=1815645847",
    defaultExam: "MS Learn AB-100",
    defaultSubject: "Agentic AI Business Solutions",
    defaultMode: "mcq",
    engine: "Playwright Headless/Persistent Browser",
  },
  {
    id: "sanfoundry",
    name: "Sanfoundry",
    domain: "sanfoundry.com",
    badge: "MODULAR ADAPTER",
    badgeColor: "text-emerald-400 border-emerald-900/80 bg-emerald-950/40",
    description: "Engineering subject-wise MCQs with hidden answer collapse parsers",
    defaultUrl: "https://www.sanfoundry.com/strength-materials-questions-answers/",
    defaultExam: "Kerala PSC AE Civil",
    defaultSubject: "Strength of Materials",
    defaultMode: "mcq",
    engine: "BeautifulSoup DOM Scraper",
  },
  {
    id: "examtopics",
    name: "ExamTopics",
    domain: "examtopics.com",
    badge: "MODULAR ADAPTER",
    badgeColor: "text-amber-400 border-amber-900/80 bg-amber-950/40",
    description: "Multi-choice exam question cards & certification portal extractor",
    defaultUrl: "https://www.examtopics.com/exams/microsoft/az-900/view/",
    defaultExam: "AZ-104 Azure Admin",
    defaultSubject: "Cloud Architecture",
    defaultMode: "mcq",
    engine: "ExamTopics Card Handler",
  },
  {
    id: "indiabix",
    name: "IndiaBIX",
    domain: "indiabix.com",
    badge: "MODULAR ADAPTER",
    badgeColor: "text-purple-400 border-purple-900/80 bg-purple-950/40",
    description: "Civil & General Aptitude question paper archives with option extraction",
    defaultUrl: "https://www.indiabix.com/civil-engineering/strength-of-materials/",
    defaultExam: "SSC JE Civil",
    defaultSubject: "Theory of Structures",
    defaultMode: "mcq",
    engine: "IndiaBIX DOM Handler",
  },
  {
    id: "keralapsc",
    name: "Kerala PSC Govt Portal",
    domain: "keralapsc.gov.in",
    badge: "GOVT ARCHIVE",
    badgeColor: "text-rose-400 border-rose-900/80 bg-rose-950/40",
    description: "Official previous question papers archive for Assistant Engineer civil exams",
    defaultUrl: "https://keralapsc.gov.in/previous-question-papers",
    defaultExam: "Kerala PSC AE Civil",
    defaultSubject: "Civil Engineering",
    defaultMode: "auto",
    engine: "PDF / Heuristic Parser",
  },
  {
    id: "custom",
    name: "Custom Exam Web Portal",
    domain: "Custom URL",
    badge: "GENERIC HEURISTIC",
    badgeColor: "text-slate-400 border-slate-800 bg-slate-900/40",
    description: "Ingest any custom target URL using heuristic HTML & MCQ auto-detection",
    defaultUrl: "",
    defaultExam: "Kerala PSC AE Civil",
    defaultSubject: "Strength of Materials",
    defaultMode: "auto",
    engine: "Auto-Detect Heuristic Parser",
  },
];

function AdminScrapingPage() {
  const { data: routeData, isLoading, refetch } = useQuery(orpc.admin.getScrapedQuestions.queryOptions());
  const { mutateAsync: triggerScrapeJobFn } = useMutation(orpc.admin.triggerScrapeJob.mutationOptions());
  const initialQuestions = routeData || [];
  const [questions, setQuestions] = useState(initialQuestions);
  
  // Selected Target Website State
  const [selectedWebsite, setSelectedWebsite] = useState<TargetWebsite>(TARGET_WEBSITES[0]);
  
  // Microsoft Learn Catalog & Auth State
  const [msCatalog, setMsCatalog] = useState<any[]>([]);
  const [selectedCatalogUrls, setSelectedCatalogUrls] = useState<string[]>([]);
  const [isFetchingCatalog, setIsFetchingCatalog] = useState(false);
  const [isAuthenticatingMs, setIsAuthenticatingMs] = useState(false);
  const [msAuthStatus, setMsAuthStatus] = useState<string | null>(null);
  const [scrapingProgress, setScrapingProgress] = useState<string | null>(null);

  // Form Config State
  const [url, setUrl] = useState(TARGET_WEBSITES[0].defaultUrl);
  const [targetExam, setTargetExam] = useState("Auto-detect");
  const [targetSubject, setTargetSubject] = useState("Auto-detect");
  const [parserMode, setParserMode] = useState(TARGET_WEBSITES[0].defaultMode);
  const [backendUrl, setBackendUrl] = useState("http://localhost:8000/scrape");
  const [maxQuestions, setMaxQuestions] = useState<number>(50);
  const [maxExamSets, setMaxExamSets] = useState<number>(msCatalog?.length || 10);  
  const [isHeadless, setIsHeadless] = useState<boolean>(true);
  
  // Execution & Telemetry State
  const [isScraping, setIsScraping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<"checking" | "online" | "offline">("checking");
  const [lastExtractionResult, setLastExtractionResult] = useState<any>(null);
  const [logFilter, setLogFilter] = useState<"all" | "selected">("all");

  const { data: logsData, refetch: refetchLogs } = useQuery({
    ...orpc.admin.getScraperLogs.queryOptions(),
    refetchInterval: isScraping ? 1500 : 4000,
  });

  useEffect(() => {
    setQuestions(routeData || []);
  }, [routeData]);

  const handleFetchMsCatalog = async () => {
    setIsFetchingCatalog(true);
    setErrorMsg(null);
    try {
      const res = await fetch("http://localhost:8000/scrape/ms-learn/catalog");
      if (res.ok) {
        const data = await res.json();
        const items = data.catalog || [];
        setMsCatalog(items);
        setSelectedCatalogUrls(items.map((item: any) => item.url));
        setSuccessMsg(`Discovered ${data.catalog_count || 0} Microsoft Learn Practice Assessments!`);
      } else {
        setErrorMsg("Failed to scan Microsoft Learn assessment catalog.");
      }
    } catch (err: any) {
      setErrorMsg(`Catalog fetch error: ${err.message}`);
    } finally {
      setIsFetchingCatalog(false);
    }
  };

  const handleBulkScrapeSelected = async () => {
    const itemsToScrape = msCatalog
      .filter((item) => selectedCatalogUrls.includes(item.url))
      .slice(0, maxExamSets);
    if (itemsToScrape.length === 0) {
      setErrorMsg("Please select at least one exam set from the catalog to scrape.");
      return;
    }

    if (
      !confirm(
        `Are you sure you want to scrape ${itemsToScrape.length} selected exam set(s)? This will execute sequential Playwright assessment crawling.`
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
      setScrapingProgress(`Scraping (${i + 1}/${itemsToScrape.length}): ${cat.exam || cat.title}...`);
      const curJobId = Math.random().toString(36).substring(7);
      try {
        const data = await triggerScrapeJobFn({
          url: cat.url,
          backendUrl,
          targetExam: `Exam ${cat.exam}`,
          targetSubject: "Microsoft Certification",
          parserMode: "mcq",
          jobId: curJobId,
          maxQuestions,
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
      `Bulk Scraping Completed! Extracted ${totalSaved} total questions across ${itemsToScrape.length} selected exam set(s).`
    );
    await refetch();
  };

  const handleLaunchMsAuth = async () => {
    setIsAuthenticatingMs(true);
    setMsAuthStatus("Launching Playwright browser... Please log in to Microsoft in the opened browser window.");
    setErrorMsg(null);
    try {
      const res = await fetch("http://localhost:8000/scrape/ms-learn/auth", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setMsAuthStatus("Microsoft Account authenticated! Persistent session state saved.");
          setSuccessMsg("Microsoft Account authenticated successfully!");
        } else {
          setMsAuthStatus("Login incomplete or timed out. Please click 'Authenticate Microsoft Account' and finish signing in.");
          setErrorMsg("Authentication not completed. Please log in in the opened browser window.");
        }
      } else {
        const errJson = await res.json();
        setMsAuthStatus(`Auth failed: ${errJson.detail || "Error launching Playwright session"}`);
      }
    } catch (err: any) {
      setMsAuthStatus(`Auth error: ${err.message}`);
    } finally {
      setIsAuthenticatingMs(false);
    }
  };

  useEffect(() => {
    const saved = localStorage.getItem("scraperBackendUrl");
    if (saved) setBackendUrl(saved);
    checkBackendHealth(saved || "http://localhost:8000/scrape");
  }, []);

  const checkBackendHealth = async (endpoint: string) => {
    setBackendStatus("checking");
    try {
      const healthUrl = endpoint.replace(/\/scrape$/, "/health");
      const res = await fetch(healthUrl, { method: "GET" });
      if (res.ok) {
        setBackendStatus("online");
      } else {
        setBackendStatus("offline");
      }
    } catch {
      setBackendStatus("offline");
    }
  };

  const handleSelectWebsite = (site: TargetWebsite) => {
    setSelectedWebsite(site);
    setUrl(site.defaultUrl);
    setTargetExam("Auto-detect");
    setTargetSubject("Auto-detect");
    setParserMode(site.defaultMode);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLastExtractionResult(null);
  };

  const handleBackendUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newUrl = e.target.value;
    setBackendUrl(newUrl);
    localStorage.setItem("scraperBackendUrl", newUrl);
    checkBackendHealth(newUrl);
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
        backendUrl,
        parserMode,
        targetExam,
        targetSubject,
        jobId,
        maxQuestions,
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

  const filteredQuestions = questions.filter((q: any) => {
    if (logFilter === "all") return true;
    if (selectedWebsite.id === "custom") return true;
    return q.sourceUrl?.toLowerCase().includes(selectedWebsite.domain.toLowerCase());
  });

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      
      <div className="px-6 pt-10 flex justify-between items-center max-w-[1400px] mx-auto mb-12">
        <Link to="/admin" className="font-mono text-xs tracking-widest text-slate-500 hover:text-white transition-colors flex items-center gap-2">
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
          <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
          <span className="mx-4 text-slate-700">/</span>
          <Link to="/admin" className="hover:text-white transition-colors">ADMIN</Link>
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
                Select a target exam website below to configure custom site handlers, trigger extraction jobs, and monitor status.
              </p>
            </div>

            <div className="font-mono text-xs text-slate-400 border border-slate-900 bg-slate-950 p-4 shrink-0 space-y-2">
              <div className="flex items-center justify-between gap-6 text-[11px] uppercase tracking-wider">
                <span className="text-slate-500">FASTAPI SERVICE:</span>
                <span className={`flex items-center gap-1.5 font-semibold ${
                  backendStatus === "online" ? "text-emerald-400" : "text-amber-400"
                }`}>
                  <span className={`w-2 h-2 rounded-full ${backendStatus === "online" ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}></span>
                  {backendStatus === "online" ? "ONLINE (PORT 8000)" : "OFFLINE (NODE FALLBACK READY)"}
                </span>
              </div>
              <div className="text-[10px] text-slate-600 truncate max-w-[280px]">
                {backendUrl}
              </div>
            </div>
          </div>
        </div>

        <section className="mb-16">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" />
              <span>01 / Select Target Website for Scraping</span>
            </h2>
            <span className="font-mono text-[10px] text-slate-500 uppercase">
              {TARGET_WEBSITES.length} Registered Web Adapters
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TARGET_WEBSITES.map((site) => {
              const isSelected = selectedWebsite.id === site.id;

              return (
                <div
                  key={site.id}
                  onClick={() => handleSelectWebsite(site)}
                  className={`p-6 border transition-all cursor-pointer relative group flex flex-col justify-between ${
                    isSelected
                      ? "border-blue-500 bg-blue-950/20 shadow-lg shadow-blue-950/40"
                      : "border-slate-900 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900/30"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${site.badgeColor}`}>
                        {site.badge}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500 truncate">
                        {site.domain}
                      </span>
                    </div>

                    <h3 className={`text-xl font-medium tracking-tight mb-2 transition-colors ${
                      isSelected ? "text-white" : "text-slate-200 group-hover:text-white"
                    }`}>
                      {site.name}
                    </h3>

                    <p className="font-mono text-xs text-slate-400 leading-relaxed mb-6">
                      {site.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-900/80 flex items-center justify-between font-mono text-xs">
                    <span className="text-[11px] text-slate-500 uppercase truncate">
                      {site.engine}
                    </span>
                    <span className={`flex items-center gap-1 font-semibold text-[11px] uppercase tracking-wider ${
                      isSelected ? "text-blue-400" : "text-slate-500 group-hover:text-slate-300"
                    }`}>
                      {isSelected ? "ACTIVE CONFIG" : "SELECT SITE"}
                      <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? "text-blue-400" : "text-slate-600"}`} />
                    </span>
                  </div>

                  {isSelected && (
                    <div className="absolute top-0 left-0 right-0 h-[2px] bg-blue-500" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-20">
          
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>02 / Configure Scraper for: <span className="text-white font-semibold">{selectedWebsite.name}</span></span>
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
                    Customize target URL, exam discipline, and extraction strategy for {selectedWebsite.domain}
                  </p>
                </div>
                <span className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${selectedWebsite.badgeColor}`}>
                  {selectedWebsite.badge}
                </span>
              </div>

              {selectedWebsite.id === "mslearn" && (
                <div className="p-5 border border-sky-900/60 bg-sky-950/20 mb-8 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-semibold text-sky-400 uppercase tracking-wider flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-sky-400" />
                        Microsoft Learn Session & Catalog Manager
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">
                        Microsoft Learn practice tests require an active authenticated Microsoft account session.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleLaunchMsAuth}
                      disabled={isAuthenticatingMs}
                      className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-mono text-xs uppercase tracking-wider transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isAuthenticatingMs ? "animate-spin" : ""}`} />
                      {isAuthenticatingMs ? "Authenticating..." : "Authenticate Microsoft Account"}
                    </button>
                  </div>

                  {msAuthStatus && (
                    <div className="p-3 bg-slate-900 border border-slate-800 text-xs font-mono text-sky-300">
                      {msAuthStatus}
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
                          {selectedCatalogUrls.length === msCatalog.length ? "Deselect All" : "Select All"}
                        </button>
                      </div>

                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {msCatalog.map((item, idx) => {
                          const isChecked = selectedCatalogUrls.includes(item.url);
                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                setSelectedCatalogUrls((prev) =>
                                  isChecked ? prev.filter((u) => u !== item.url) : [...prev, item.url]
                                );
                              }}
                              className={`p-3 bg-slate-900 border cursor-pointer flex items-center justify-between gap-4 transition-all ${
                                isChecked
                                  ? "border-sky-500/80 bg-sky-950/40 ring-1 ring-sky-500/30"
                                  : "border-slate-800 hover:border-slate-700 opacity-70"
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}} // Controlled via parent div onClick
                                  className="w-4 h-4 rounded border-slate-700 text-sky-500 focus:ring-sky-500/20 bg-slate-950 shrink-0 cursor-pointer"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs text-slate-200 font-medium truncate">{item.title}</p>
                                  <p className="text-[10px] font-mono text-slate-400 truncate">{item.url}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
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
                          disabled={isScraping || selectedCatalogUrls.length === 0 || backendStatus === "offline"}
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
                
                {selectedWebsite.id !== "mslearn" && (
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400 flex items-center justify-between">
                      <span>TARGET PAGE / EXAM URL <span className="text-rose-400">*</span></span>
                      <Globe className="w-3.5 h-3.5 text-slate-600" />
                    </label>
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder={`https://${selectedWebsite.domain}/questions/sample`}
                      required={selectedWebsite.id !== "mslearn"}
                      className="w-full bg-slate-900/90 border border-slate-800 focus:border-white outline-none font-mono text-sm text-white px-4 py-3 tracking-tight transition-colors placeholder:text-slate-700"
                    />
                  </div>
                )}

                {/* Form fields: TARGET EXAM & SUBJECT auto-detected by scraper engine */}

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 pt-2">
                  
                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
                      EXTRACTION STRATEGY
                    </label>
                    <select
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
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
                      BATCH: MAX SETS
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxExamSets}
                      onChange={(e) => setMaxExamSets(parseInt(e.target.value, 10) || 5)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-300 px-3 py-3 outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
                      BATCH: MAX Qs
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={maxQuestions}
                      onChange={(e) => setMaxQuestions(parseInt(e.target.value, 10) || 5)}
                      className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-300 px-3 py-3 outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
                      BROWSER HEADLESS MODE
                    </label>
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
                        <span className={`w-2 h-2 rounded-full ${isHeadless ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                        {isHeadless ? "Headless (Background)" : "GUI Browser (Visible)"}
                      </span>
                      <span className="text-[10px] opacity-75">{isHeadless ? "ON" : "OFF"}</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="font-mono text-xs uppercase tracking-widest text-slate-400">
                      ENDPOINT (FASTAPI)
                    </label>
                    <input
                      type="text"
                      value={backendUrl}
                      onChange={handleBackendUrlChange}
                      placeholder="http://localhost:8000/scrape"
                      className="w-full bg-slate-900 border border-slate-800 focus:border-slate-500 font-mono text-xs text-slate-300 px-3 py-3 outline-none transition-colors"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-800 flex gap-4">
                  {selectedWebsite.id === "mslearn" ? (
                    <button
                      type="button"
                      disabled={isScraping || selectedCatalogUrls.length === 0 || backendStatus === "offline"}
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
                      {lastExtractionResult.engine || lastExtractionResult.mode || "Ingestion Success"}
                    </span>
                  </div>

                  <p className="font-mono text-sm text-slate-200">
                    {successMsg}
                  </p>

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
                  <span>// Site Adapter Specs</span>
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
                      {questions.filter((q: any) => q.sourceUrl?.toLowerCase().includes(selectedWebsite.domain.toLowerCase())).length} Batches
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
                  {selectedWebsite.id === "mslearn" ? (
                    "Microsoft Learn uses an interactive Playwright crawler to navigate practice tests, click check answer buttons, and harvest rationale explanations."
                  ) : selectedWebsite.id === "sanfoundry" ? (
                    "Sanfoundry adapter automatically extracts question prompts, multiple choices, and uncollapses hidden answers."
                  ) : (
                    `Target URL parser for ${selectedWebsite.name}. Ensure the link is publicly accessible for extraction.`
                  )}
                </p>
              </div>

            </div>

          </div>

        </section>

        {/* SECTION 2.5: LIVE TELEMETRY & EXECUTION LOGS */}
        <section className="mb-12">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 border-b border-slate-900 pb-3">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span>03 / Live Scraper Execution & Progress Logs</span>
              </h2>
              <p className="font-mono text-[10px] text-slate-500 uppercase mt-1">
                Real-time Playwright crawler output & background thread progress
              </p>
            </div>
            <div className="flex items-center gap-3 font-mono text-[10px]">
              <span className="text-slate-500 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                Auto-telemetry active
              </span>
              <button
                type="button"
                onClick={() => refetchLogs()}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 uppercase tracking-widest transition-colors"
              >
                Refresh Log Output
              </button>
            </div>
          </div>

          <div className="border border-slate-900 bg-[#070b0e] p-4 font-mono text-xs space-y-1.5 max-h-72 overflow-y-auto shadow-inner rounded-none">
            {logsData?.logs && logsData.logs.length > 0 ? (
              logsData.logs.map((logLine: string, index: number) => {
                const isErr = logLine.toLowerCase().includes("error") || logLine.toLowerCase().includes("warning") || logLine.toLowerCase().includes("fallback");
                const isSuccess = logLine.toLowerCase().includes("success") || logLine.toLowerCase().includes("extracted") || logLine.toLowerCase().includes("saved");
                const isHighlight = logLine.startsWith("[") || logLine.includes("MS LEARN");

                return (
                  <div
                    key={index}
                    className={`leading-relaxed font-mono text-[11px] ${
                      isErr
                        ? "text-rose-400 font-semibold"
                        : isSuccess
                        ? "text-emerald-400"
                        : isHighlight
                        ? "text-blue-300"
                        : "text-slate-400"
                    }`}
                  >
                    <span className="text-slate-600 select-none mr-2">[{String(index + 1).padStart(3, "0")}]</span>
                    {logLine}
                  </div>
                );
              })
            ) : (
              <div className="text-slate-600 italic py-6 text-center">
                Waiting for scraper log telemetry... Trigger a scraping job above to stream real-time Playwright execution logs.
              </div>
            )}
          </div>
        </section>

        {/* SECTION 4: WEBSITE JOB HISTORY & INGESTION LOGS */}
        <section>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-slate-900 pb-4">
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-400 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                <span>03 / Scraped Ingestion Logs ({filteredQuestions.length})</span>
              </h2>
              <p className="font-mono text-[10px] text-slate-500 uppercase mt-1">
                Showing logs for: {logFilter === "all" ? "All Portals" : selectedWebsite.name}
              </p>
            </div>

            {/* Filter Toggle */}
            <div className="flex items-center border border-slate-900 bg-slate-950 p-1 font-mono text-xs">
              <button
                onClick={() => setLogFilter("all")}
                className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                  logFilter === "all" ? "bg-slate-800 text-white font-semibold" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                All Portals
              </button>
              <button
                onClick={() => setLogFilter("selected")}
                className={`px-3 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                  logFilter === "selected" ? "bg-slate-800 text-white font-semibold" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                Only {selectedWebsite.name}
              </button>
            </div>
          </div>

          <div className="border border-slate-900 overflow-hidden bg-slate-950/40">
            <table className="w-full text-left font-mono text-xs">
              <thead className="border-b border-slate-900 bg-slate-900/50 text-slate-500 uppercase tracking-widest text-[10px]">
                <tr>
                  <th className="p-4 font-normal">Source URL</th>
                  <th className="p-4 font-normal">Status</th>
                  <th className="p-4 font-normal">Extracted Qs</th>
                  <th className="p-4 font-normal">Exam / Subject</th>
                  <th className="p-4 font-normal">Timestamp</th>
                  <th className="p-4 font-normal text-right">Review Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/80 text-slate-300">
                {filteredQuestions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-600">
                      No scraping job history found for this view. Select a portal above and run a job to ingest questions.
                    </td>
                  </tr>
                ) : (
                  filteredQuestions.map((q: any) => {
                    const metadata = (q.parsedData as any)?.metadata || {};
                    const extractedElements = (q.parsedData as any)?.extractedElements || [];
                    const count = extractedElements.length || metadata.extractedCount || 0;

                    return (
                      <tr key={q.id} className="hover:bg-slate-900/40 transition-colors">
                        <td className="p-4 max-w-[280px] truncate text-slate-300" title={q.sourceUrl}>
                          <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors flex items-center gap-1">
                            <span className="truncate">{q.sourceUrl}</span>
                            <ExternalLink className="w-3 h-3 text-slate-600 shrink-0" />
                          </a>
                        </td>
                        <td className="p-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                              q.status === "pending"
                                ? "bg-amber-950/40 border-amber-900/80 text-amber-400"
                                : q.status === "approved"
                                ? "bg-emerald-950/40 border-emerald-900/80 text-emerald-400"
                                : "bg-rose-950/40 border-rose-900/80 text-rose-400"
                            }`}
                          >
                            {q.status}
                          </span>
                        </td>
                        <td className="p-4 text-white font-medium">
                          {count} Qs
                        </td>
                        <td className="p-4 text-slate-500">
                          {metadata.exam || "Kerala PSC AE"} · {metadata.subject || "SOM"}
                        </td>
                        <td className="p-4 text-slate-600 text-[11px]" suppressHydrationWarning>
                          {new Date(q.createdAt).toISOString().replace("T", " ").slice(0, 19)} UTC
                        </td>
                        <td className="p-4 text-right">
                          <Link
                            to="/admin/review"
                            className="text-slate-400 hover:text-white border-b border-slate-700 hover:border-white pb-0.5 transition-colors uppercase tracking-wider text-[11px]"
                          >
                            Review Queue →
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

      </main>

    </div>
  );
}
