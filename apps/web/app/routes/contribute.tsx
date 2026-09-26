import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { useState } from "react";
import { trackEvent } from "../../lib/analytics";
import { canonicalLink } from "../../lib/json-ld";
import { orpc } from "../../lib/orpc";
import { FeatureUnavailable } from "../components/feature/FeatureGate";
import { Skeleton, SkeletonRegion } from "../components/ui/Skeleton";
import { useFeatureFlag } from "../hooks/useFeatureFlag";

export const Route = createFileRoute("/contribute")({
  head: () => ({
    meta: [
      { title: "Contribute Question Papers — Prepora" },
      {
        name: "description",
        content:
          "Help thousands of students by contributing past question papers via Markdown. Fast, open, and verified.",
      },
    ],
    links: [canonicalLink("/contribute")],
  }),
  component: ContributePage,
});

// docs/roadmap/engineering-roadmap.md item 24: this form used to call setSubmitted(true) with no
// network request at all, then show a "Transmission Accepted... successfully injected into the
// community queue" message that was false — nothing was ever persisted. The markdown tab now calls
// the real contributions.submit mutation. The PDF tab has no backing object-storage yet (no upload
// pipeline exists anywhere in this app), so instead of pretending to accept a file, it's disabled
// with an honest "not yet available" state.

function ContributePage() {
  const [tab, setTab] = useState<"markdown" | "pdf">("markdown");
  const [markdownText, setMarkdownText] = useState("");
  const [originAuthority, setOriginAuthority] = useState("");
  const [classification, setClassification] = useState("");
  const [year, setYear] = useState("");
  const [domainSector, setDomainSector] = useState("");

  const {
    mutate: submitContribution,
    isPending,
    isSuccess,
    error,
    reset,
  } = useMutation(orpc.contributions.submit.mutationOptions());
  const { enabled: contributeEnabled, isLoading: isLoadingFlags } = useFeatureFlag("contribute");

  if (isLoadingFlags) {
    return (
      <SkeletonRegion
        label="Loading…"
        className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-6 md:pt-16 space-y-8"
      >
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-3 w-80 max-w-full" />
        <Skeleton className="h-64 w-full max-w-4xl" />
      </SkeletonRegion>
    );
  }

  // The "contribute" feature flag (admin → Settings). Its links are hidden everywhere else while
  // it's off, but someone can still arrive here directly or from an old bookmark; the server also
  // refuses submissions, so this is the honest page to show them.
  if (!contributeEnabled) {
    return (
      <FeatureUnavailable
        eyebrow="Contributions closed"
        title="We're not accepting contributions right now."
      />
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white flex items-center justify-center p-6">
        <div className="max-w-xl w-full border-[0.5px] border-white/10 bg-[#06080a] p-12 shadow-2xl">
          <div className="space-y-4">
            <h1 className="font-mono text-2xl tracking-tighter text-white uppercase flex items-center gap-3">
              <span className="text-white/30 text-base">»</span> Submission Received
            </h1>
            <p className="font-mono text-[11px] tracking-widest text-slate-500 uppercase leading-relaxed">
              Your contribution has been queued for review by a moderator.
            </p>
          </div>
          <div className="pt-12 mt-12 border-t-[0.5px] border-white/5 space-y-4">
            <button
              type="button"
              onClick={() => {
                reset();
                setMarkdownText("");
                setOriginAuthority("");
                setClassification("");
                setYear("");
                setDomainSector("");
              }}
              className="w-full font-mono uppercase tracking-widest text-[10px] h-12 bg-transparent text-white hover:bg-white hover:text-black border-[0.5px] border-white/20 transition-all rounded-none"
            >
              Submit Another
            </button>
            <a
              href="/"
              className="flex items-center justify-center w-full font-mono uppercase tracking-widest text-[9px] text-slate-500 hover:text-white transition-colors h-12"
            >
              Return to Core
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 selection:bg-slate-700 selection:text-white font-sans flex flex-col">
      <main className="max-w-[1200px] w-full mx-auto px-4 sm:px-6 pb-20 md:pb-32 flex-1 pt-6 md:pt-16">
        <section className="grid grid-cols-1 md:grid-cols-12 gap-12">
          {/* Asymmetric Spacer / Context Col */}
          <div className="col-span-1 md:col-span-3 lg:col-span-3 border-r border-slate-900/50 pr-6 space-y-12 h-full hidden md:block">
            <div>
              <h2 className="text-white tracking-tighter text-3xl font-light mb-6">
                GROW
                <br />
                THE INDEX.
              </h2>
              <p className="font-mono text-[10px] uppercase text-slate-500 tracking-widest leading-relaxed">
                Empower thousands of students by injecting raw verified exam papers into our
                structural datasets.
              </p>
            </div>
            <div className="pt-12 border-t border-slate-900/50">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-500 mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 animate-pulse" />
                SYSTEM READY
              </div>
              <p className="font-mono text-xs text-slate-600 uppercase">Awaiting Data Vector</p>
            </div>
          </div>

          <div className="col-span-1 md:col-span-9 lg:col-span-8 md:pl-6 pb-16 md:pb-24">
            {/* The page's introduction lives in the sidebar, which is hidden on phones — give
                small screens a title so the form isn't the first and only thing they see. */}
            <div className="md:hidden border-b border-slate-900 pb-6 mb-12">
              <h1 className="text-white tracking-tighter text-3xl font-light mb-3">
                Grow the index.
              </h1>
              <p className="font-mono text-[10px] uppercase text-slate-500 tracking-widest leading-relaxed">
                Contribute a verified exam paper or certification question set.
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (tab !== "markdown" || !markdownText.trim()) return;
                submitContribution(
                  {
                    examSlug: originAuthority || undefined,
                    examVariantSlug: classification || undefined,
                    year: year ? Number(year) : undefined,
                    subjectSlug: domainSector || undefined,
                    markdownContent: markdownText,
                  },
                  {
                    onSuccess: (res) => {
                      trackEvent("contribution", { entityType: "contribution", entityId: res.id });
                    },
                  },
                );
              }}
              className="space-y-16 md:space-y-24 max-w-4xl"
            >
              {/* Exam Matrix */}
              <div className="space-y-12">
                <h3 className="font-mono text-xs text-slate-500 tracking-[0.2em] uppercase border-b border-slate-900 pb-4">
                  01 / Metadata Identity
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-12">
                  <div className="flex flex-col gap-4">
                    <label
                      htmlFor="contribute-origin-authority"
                      className="font-mono text-[10px] text-slate-500 tracking-widest uppercase"
                    >
                      Origin Authority
                    </label>
                    <input
                      id="contribute-origin-authority"
                      value={originAuthority}
                      onChange={(e) => setOriginAuthority(e.target.value)}
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Kerala PSC"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label
                      htmlFor="contribute-classification"
                      className="font-mono text-[10px] text-slate-500 tracking-widest uppercase"
                    >
                      Classification / Post Name
                    </label>
                    <input
                      id="contribute-classification"
                      value={classification}
                      onChange={(e) => setClassification(e.target.value)}
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Assistant Engineer"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label
                      htmlFor="contribute-year"
                      className="font-mono text-[10px] text-slate-500 tracking-widest uppercase"
                    >
                      Temporal Stamp (Year)
                    </label>
                    <input
                      id="contribute-year"
                      type="number"
                      min="1990"
                      max="2030"
                      value={year}
                      onChange={(e) => setYear(e.target.value)}
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="YYYY"
                    />
                  </div>

                  <div className="flex flex-col gap-4">
                    <label
                      htmlFor="contribute-domain-sector"
                      className="font-mono text-[10px] text-slate-500 tracking-widest uppercase"
                    >
                      Domain Sector
                    </label>
                    <input
                      id="contribute-domain-sector"
                      value={domainSector}
                      onChange={(e) => setDomainSector(e.target.value)}
                      className="bg-transparent border-b border-slate-700 outline-none text-xl font-light text-white placeholder-slate-800 pb-3 transition-colors focus:border-white"
                      placeholder="e.g. Civil Engineering"
                    />
                  </div>
                </div>
              </div>

              {/* Data Vector Stream */}
              <div className="space-y-12">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b border-slate-900 pb-4">
                  <h3 className="font-mono text-xs text-slate-500 tracking-[0.2em] uppercase">
                    02 / Content Payload
                  </h3>

                  <div className="font-mono text-[10px] tracking-widest flex gap-6 uppercase whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setTab("markdown")}
                      className={`transition-colors ${tab === "markdown" ? "text-white border-b border-white pb-1" : "text-slate-600 hover:text-slate-400"}`}
                    >
                      [ Markdown ]
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab("pdf")}
                      className={`transition-colors ${tab === "pdf" ? "text-white border-b border-white pb-1" : "text-slate-600 hover:text-slate-400"}`}
                    >
                      [ Binary PDF ]
                    </button>
                  </div>
                </div>

                {tab === "markdown" ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="flex flex-col relative group">
                      <div className="absolute top-4 right-4 font-mono text-[9px] text-slate-600 uppercase">
                        Input Node
                      </div>
                      <textarea
                        value={markdownText}
                        onChange={(e) => setMarkdownText(e.target.value)}
                        rows={16}
                        required
                        className="w-full bg-[#030406] border border-slate-800 p-6 text-[11px] font-mono leading-relaxed text-slate-400 focus:outline-none focus:border-slate-500 focus:text-slate-200 transition-colors resize-y shadow-inner"
                        placeholder={
                          "# Question 1\n\nWhat is the SI unit of modulus of elasticity?\n\nA) ...\nB) ...\n\n**Answer:** B\n**Explanation:** ..."
                        }
                      />
                    </div>

                    <div className="flex flex-col relative">
                      <div className="absolute top-4 right-4 font-mono text-[9px] text-emerald-500/50 uppercase">
                        Render Output
                      </div>
                      <div className="w-full bg-[#0a0c10] border border-slate-800/50 p-6 min-h-[300px]">
                        <div className="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed">
                          {markdownText || (
                            <span className="text-slate-600">Preview appears here…</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-900 bg-[#030406] p-20 flex flex-col items-center justify-center opacity-50 cursor-not-allowed">
                    <Upload className="w-8 h-8 text-slate-700 mb-6" />
                    <span className="font-mono text-xs text-white uppercase tracking-widest mb-4">
                      PDF upload not yet available
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest max-w-[280px] text-center">
                      Use the Markdown tab for now — PDF ingestion requires file storage we haven't
                      built yet.
                    </span>
                  </div>
                )}
              </div>

              {/* Execution */}
              <div className="pt-16 border-t border-slate-900 flex flex-col md:flex-row items-center justify-between gap-8">
                <span className="font-mono text-[9px] text-slate-600 uppercase tracking-widest flex items-center gap-3">
                  <span className="w-1 h-3 bg-slate-600 block" /> Subject To Manual Validation By
                  Core Operators
                </span>
                <button
                  type="submit"
                  disabled={tab !== "markdown" || !markdownText.trim() || isPending}
                  className="w-full md:w-auto font-mono uppercase tracking-widest text-[11px] h-14 bg-white text-black hover:bg-transparent hover:text-white border border-white transition-all rounded-none px-12 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isPending ? "Submitting…" : "Execute Upload"}
                </button>
              </div>

              {error && (
                <p className="font-mono text-xs text-rose-400">
                  Submission failed. Please try again.
                </p>
              )}
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
