import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  Clock,
  RotateCcw,
  Sparkles,
  Grid,
  Check,
  Flag,
  Award,
  BookOpen,
  ArrowRight,
  Zap,
  BarChart2,
  ExternalLink,
} from "lucide-react";

import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { orpc } from "../../lib/orpc";

const practiceSearchSchema = z.object({
  examSlug: z.string().optional(),
  q: z.number().optional(),
  viewMode: z.enum(["simulation", "learn"]).optional(),
});

export const Route = createFileRoute("/practice")({
  validateSearch: (search) => practiceSearchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Practice & Learn Exam Hub — Prepora" },
      { name: "description", content: "Distraction-free exam practice, Learn Mode, and mock test environment with verified step-by-step resolution logic." },
    ],
  }),
  component: PracticePage,
});

type Mode = "practice" | "mock";
type Stage = "setup" | "active" | "results";

interface Question {
  id: string;
  text: string;
  options: { key: string; text: string }[];
  correctKey: string;
  explanation: string;
  topic: string;
  additionalReading?: string | string[];
  additionalReadings?: string[];
  additionalReadingLinks?: Array<{ text: string; url?: string }>;
}

interface AdditionalReadingResource {
  text: string;
  url?: string;
}

function normalizeReadingTitle(text: string) {
  return text
    .replace(/^[-*•]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAdditionalReadingFromExplanation(explanation: string) {
  const resources: string[] = [];
  const additionalReadingPattern =
    /Additional Reading:\s*([\s\S]*?)(?=\n\s*(?:Objective|What This Item Tests|Rationale|Additional Reading Resources):|$)/i;
  const match = explanation.match(additionalReadingPattern);

  if (match?.[1]) {
    resources.push(
      ...match[1]
        .split(/\n+/)
        .map(normalizeReadingTitle)
        .filter(Boolean)
    );
  }

  return {
    explanation: explanation.replace(additionalReadingPattern, "").trim(),
    resources,
  };
}

function getQuestionResolution(question: Question) {
  const extracted = extractAdditionalReadingFromExplanation(question.explanation || "");
  const resourceMap = new Map<string, AdditionalReadingResource>();

  const addResource = (text?: string, url?: string) => {
    const title = normalizeReadingTitle(text || "");
    if (!title) return;
    const key = title.toLowerCase();
    const existing = resourceMap.get(key);
    resourceMap.set(key, {
      text: existing?.text || title,
      url: url || existing?.url,
    });
  };

  extracted.resources.forEach((text) => addResource(text));

  const rawReadings = question.additionalReadings || question.additionalReading;
  if (Array.isArray(rawReadings)) {
    rawReadings.forEach((text) => addResource(text));
  } else if (typeof rawReadings === "string") {
    rawReadings.split(/\n+/).forEach((text) => addResource(text));
  }

  (question.additionalReadingLinks || []).forEach((link) => addResource(link.text, link.url));

  return {
    explanation: extracted.explanation || question.explanation,
    additionalReadings: Array.from(resourceMap.values()),
  };
}

function ResolutionText({ text }: { text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) return null;

  return (
    <div className="space-y-4 text-sm sm:text-base text-slate-300 font-light leading-relaxed">
      {blocks.map((block, idx) => {
        const sectionMatch = block.match(/^([^:\n]{2,60}):\s*([\s\S]*)$/);
        if (sectionMatch) {
          const [, label, body] = sectionMatch;
          return (
            <div key={idx} className="space-y-1">
              <div className="font-mono text-[10px] uppercase tracking-widest text-sky-300">
                {label}
              </div>
              {body.trim() && (
                <p className="whitespace-pre-line">
                  {body.trim()}
                </p>
              )}
            </div>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

function AdditionalReadingResources({ resources }: { resources: AdditionalReadingResource[] }) {
  if (resources.length === 0) return null;

  return (
    <div className="border-t border-sky-900/50 pt-4 mt-4">
      <div className="flex items-center gap-2 text-[10px] font-mono text-amber-300 uppercase tracking-widest mb-3">
        <BookOpen className="w-3.5 h-3.5" /> Additional Reading Resources
      </div>
      <ul className="space-y-2">
        {resources.map((resource, resourceIdx) => (
          <li key={resourceIdx} className="text-sm text-slate-300 leading-relaxed">
            {resource.url ? (
              <a
                href={resource.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sky-300 hover:text-white hover:underline transition-colors"
              >
                {resource.text}
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            ) : (
              <span>{resource.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const DEMO_QUESTIONS: Question[] = [
  {
    id: "q1",
    text: "What is the SI unit of modulus of elasticity (Young's Modulus)?",
    options: [
      { key: "A", text: "Newton (N)" },
      { key: "B", text: "N/mm² (or Pascal, Pa)" },
      { key: "C", text: "mm / N" },
      { key: "D", text: "N · mm" },
    ],
    correctKey: "B",
    explanation: "Modulus of elasticity (E) = Stress / Strain. Stress is measured in N/mm² and strain is dimensionless. Therefore E is measured in N/mm².",
    topic: "Elasticity",
  },
  {
    id: "q2",
    text: "The ratio of lateral strain to linear (longitudinal) strain within elastic limit is known as?",
    options: [
      { key: "A", text: "Poisson's ratio" },
      { key: "B", text: "Young's modulus" },
      { key: "C", text: "Bulk modulus" },
      { key: "D", text: "Modulus of rigidity" },
    ],
    correctKey: "A",
    explanation: "Poisson's ratio (ν) = Lateral Strain / Longitudinal Strain. For isotropic materials, its value typically ranges between 0.25 and 0.35.",
    topic: "Elasticity",
  },
  {
    id: "q3",
    text: "For a simply supported beam of span L subjected to a uniform distributed load (UDL) of intensity w, the maximum bending moment is?",
    options: [
      { key: "A", text: "wL / 4" },
      { key: "B", text: "wL² / 8" },
      { key: "C", text: "wL² / 12" },
      { key: "D", text: "wL² / 2" },
    ],
    correctKey: "B",
    explanation: "The maximum bending moment occurs at the mid-span of a simply supported beam under UDL and equals M_max = (w · L²) / 8.",
    topic: "Bending Moments",
  },
];

function PracticePage() {
  const search = Route.useSearch();
  const examSlug = search?.examSlug;
  const initialQ = search?.q;

  const [mode, setMode] = useState<Mode>("practice");
  const [viewMode, setViewMode] = useState<"simulation" | "learn">(
    search?.viewMode === "learn" ? "learn" : "simulation"
  );
  const [stage, setStage] = useState<Stage>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Learn Mode specific states
  const [showAllExplanations, setShowAllExplanations] = useState(false);
  const [revealedExplanations, setRevealedExplanations] = useState<Record<string, boolean>>({});
  const [learnAnswers, setLearnAnswers] = useState<Record<string, string>>({});

  const { data: realExamData } = useQuery(
    orpc.exams.getBySlug.queryOptions({ input: { examSlug: examSlug || "" } })
  );

  const activeQuestions: Question[] = (realExamData?.questions && realExamData.questions.length > 0)
    ? (realExamData.questions as any)
    : DEMO_QUESTIONS;

  useEffect(() => {
    if (examSlug) {
      setStage("active");
      if (initialQ && initialQ > 0 && initialQ <= activeQuestions.length) {
        setCurrentIndex(initialQ - 1);
      }
    }
  }, [examSlug, initialQ, activeQuestions.length]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === "active") {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [stage]);

  const currentQ = activeQuestions[currentIndex] || activeQuestions[0];

  const handleSelectOption = (key: string) => {
    if (mode === "practice" && submitted[currentQ.id]) return;
    setAnswers((prev) => ({ ...prev, [currentQ.id]: key }));
  };

  const handleCheckAnswer = () => {
    if (answers[currentQ.id]) {
      setSubmitted((prev) => ({ ...prev, [currentQ.id]: true }));
    }
  };

  const handleToggleFlag = () => {
    setFlagged((prev) => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }));
  };

  const calculateScore = () => {
    let correct = 0;
    let attempted = 0;
    activeQuestions.forEach((q) => {
      if (answers[q.id]) {
        attempted++;
        if (answers[q.id] === q.correctKey) correct++;
      }
    });
    return { correct, attempted, total: activeQuestions.length };
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── 1. Setup Stage ──
  if (stage === "setup") {
    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
        {/* Back Context */}
        <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-16">
          <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
            ← BACK TO ROOT
          </Link>
        </div>

        <main className="max-w-[1200px] mx-auto px-6">
          {/* Context Rail */}
          <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-24 border-b border-slate-900 pb-4">
            <Link to="/" className="hover:text-white transition-colors">ROOT</Link>
            <span className="mx-4 text-slate-700">/</span>
            <span className="text-slate-300">SIMULATION GRID</span>
          </div>

          <div className="mb-24 flex flex-col lg:flex-row lg:items-end justify-between gap-12 border-b border-slate-800 pb-12">
            <div className="max-w-2xl">
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-normal tracking-tighter text-white mb-6 leading-tight uppercase">
                Session Initialization
              </h1>
              <p className="font-mono text-xs tracking-widest text-slate-500 uppercase leading-relaxed">
                Configure simulation parameters. High-yield raw vectors ready for traversal.
              </p>
            </div>
            <div className="font-mono text-[10px] text-slate-600 tracking-widest uppercase text-right shrink-0">
               SYS: ONLINE <br/>
               LATENCY: OPTIMAL
            </div>
          </div>

          {/* Configuration Space */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
            
            {/* Simulation Topology Selection */}
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
                // Simulation Protocol
              </h2>
              
              <div className="border-t-2 border-b-2 border-slate-900 bg-slate-900 gap-px grid grid-cols-1">
                <button
                  onClick={() => setMode("practice")}
                  className={`bg-[#06080a] p-8 hover:bg-slate-900/30 transition-colors text-left border-b border-slate-900/50 flex flex-col ${mode === "practice" ? 'border-l-2 border-l-slate-300 bg-slate-900/20' : ''}`}
                >
                  <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-4">PROTOCOL ALPHA</span>
                  <h3 className={`text-xl font-light mb-2 transition-colors ${mode === "practice" ? "text-white" : "text-slate-300"}`}>
                    Untimed Practice Sequence
                  </h3>
                  <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                    Immediate telemetry. Step-by-step resolution logic active.
                  </p>
                </button>
                <button
                  onClick={() => setMode("mock")}
                  className={`bg-[#06080a] p-8 hover:bg-slate-900/30 transition-colors text-left border-slate-900/50 flex flex-col ${mode === "mock" ? 'border-l-2 border-l-slate-300 bg-slate-900/20' : ''}`}
                >
                     <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-4">PROTOCOL OMEGA</span>
                    <h3 className={`text-xl font-light mb-2 transition-colors ${mode === "mock" ? "text-white" : "text-slate-300"}`}>
                       Strict Live Simulation
                    </h3>
                    <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">
                       Time constraints enforced. Scoring delayed to completion summary.
                    </p>
                </button>
              </div>
            </div>

            {/* Target Matrix */}
            <div>
              <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
                // Target Vectors
              </h2>

              <div className="space-y-8">
                 <div>
                    <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-4">
                      Target Framework
                    </label>
                    <select className="w-full bg-[#06080a] border-b-2 border-slate-800 text-white font-light text-lg p-3 outline-none hover:border-slate-600 focus:border-slate-400 transition-colors cursor-pointer rounded-none appearance-none font-mono tracking-widest uppercase text-xs">
                        <option>Kerala PSC — Assistant Engineer</option>
                        <option>GATE Civil Engineering</option>
                        <option>SSC JE Civil</option>
                    </select>
                 </div>
                 
                 <div>
                    <label className="font-mono text-[10px] text-slate-500 uppercase tracking-widest block mb-4">
                      Domain Focus
                    </label>
                    <select className="w-full bg-[#06080a] border-b-2 border-slate-800 text-white font-light text-lg p-3 outline-none hover:border-slate-600 focus:border-slate-400 transition-colors cursor-pointer rounded-none appearance-none font-mono tracking-widest uppercase text-xs">
                        <option>All Disciplinary Vectors</option>
                        <option>Strength of Materials</option>
                        <option>Fluid Mechanics</option>
                    </select>
                 </div>
                 
                 <div className="pt-8 text-right">
                    <button 
                       onClick={() => { setStage("active"); setTimerSeconds(0); }}
                       className="border border-slate-700 hover:border-white px-8 py-4 font-mono text-xs uppercase tracking-widest transition-colors hover:bg-white hover:text-black"
                    >
                      INITIALIZE SEQUENCE
                    </button>
                 </div>
              </div>
            </div>

          </div>
        </main>
      </div>
    );
  }

  // ── 2. Active Session Stage ──
  if (stage === "active") {
    const isAnsSubmitted = mode === "practice" ? submitted[currentQ.id] : false;
    const selectedKey = answers[currentQ.id];
    const isLastQuestion = currentIndex === activeQuestions.length - 1;

    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white flex flex-col">
        {/* Top Minimal HUD Bar with Mode Switcher */}
        <div className="px-6 py-4 border-b border-slate-900 bg-[#06080a] flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Link
              to={examSlug ? "/exams/$examSlug" : "/exams"}
              params={{ examSlug: examSlug || "" }}
              className="font-mono text-xs text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
            >
              ← EXAM HUB
            </Link>
            <span className="text-slate-700 hidden sm:inline">|</span>
            <span className="text-xs font-mono px-3 py-1 bg-slate-900 text-sky-400 tracking-widest uppercase border border-slate-800 hidden sm:inline-block truncate max-w-xs">
              {realExamData?.name || examSlug || "MS-LEARN"}
            </span>
          </div>

          {/* Dual Mode Selector Pills */}
          <div className="flex items-center border border-slate-800 bg-slate-950 p-1 rounded-none font-mono text-[10px] uppercase tracking-widest">
            <button
              onClick={() => setViewMode("simulation")}
              className={`px-4 py-1.5 transition-all flex items-center gap-2 ${
                viewMode === "simulation"
                  ? "bg-slate-800 text-white font-bold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <Zap className="w-3 h-3 text-amber-400" /> SIMULATION
            </button>
            <button
              onClick={() => setViewMode("learn")}
              className={`px-4 py-1.5 transition-all flex items-center gap-2 ${
                viewMode === "learn"
                  ? "bg-sky-950 text-sky-400 border border-sky-900/60 font-bold"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <BookOpen className="w-3 h-3 text-sky-400" /> LEARN MODE
            </button>
          </div>

          <div className="flex items-center gap-4">
            {viewMode === "learn" ? (
              <button
                onClick={() => setShowAllExplanations((prev) => !prev)}
                className={`px-3 py-1.5 border text-[10px] font-mono uppercase tracking-widest transition-colors flex items-center gap-2 ${
                  showAllExplanations
                    ? "bg-sky-950 border-sky-700 text-sky-300"
                    : "border-slate-800 text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                <Sparkles className="w-3 h-3 text-sky-400" />
                {showAllExplanations ? "HIDE EXPLANATIONS" : "EXPAND EXPLANATIONS"}
              </button>
            ) : (
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <Clock className="w-3.5 h-3.5 text-white/50" /> {formatTime(timerSeconds)}
              </div>
            )}

            <button
              onClick={() => setStage("results")}
              className="px-4 py-1.5 border border-slate-700 hover:border-white text-xs font-mono uppercase tracking-widest text-slate-300 hover:text-black hover:bg-white transition-colors"
            >
              TERMINATE
            </button>
          </div>
        </div>

        {/* VIEW MODE 1: LEARN MODE (Continuous Question Feed with Revealed Answers & Explanations) */}
        {viewMode === "learn" ? (
          <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-4 border-t border-slate-900">
            {/* Learn Mode Full Scroll Feed */}
            <main className="lg:col-span-3 border-r border-slate-900 p-6 sm:p-12 md:p-16 space-y-16">
              <div className="border-b border-slate-800 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <span className="font-mono text-xs text-sky-400 uppercase tracking-[0.2em] block mb-2">
                    // LEARN MODE ARCHIVE VIEW
                  </span>
                  <h1 className="text-3xl md:text-4xl text-white font-light tracking-tight">
                    Full Question & Resolution Matrix ({activeQuestions.length})
                  </h1>
                </div>
                <button
                  onClick={() => setShowAllExplanations((prev) => !prev)}
                  className="font-mono text-xs uppercase tracking-widest px-4 py-2.5 bg-sky-950 border border-sky-800 text-sky-300 hover:bg-sky-900 transition-colors self-start md:self-auto shrink-0 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {showAllExplanations ? "COLLAPSE EXPLANATIONS" : "EXPAND ALL EXPLANATIONS"}
                </button>
              </div>

              <div className="space-y-16">
                {activeQuestions.map((q, idx) => {
                  const qNumStr = String(idx + 1).padStart(2, "0");
                  const userAns = learnAnswers[q.id];
                  const isExplanationShown = showAllExplanations || revealedExplanations[q.id] || !!userAns;
                  const resolution = getQuestionResolution(q);

                  return (
                    <div
                      key={q.id}
                      id={`q-item-${idx + 1}`}
                      className="p-8 bg-[#06080a] border border-slate-900 hover:border-slate-800 transition-all rounded-none scroll-mt-24 space-y-8"
                    >
                      {/* Item Header */}
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900 pb-4">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-xs text-sky-400 bg-sky-950/60 border border-sky-900/80 px-2.5 py-1 uppercase tracking-widest">
                            QUESTION {qNumStr} / {String(activeQuestions.length).padStart(2, "0")}
                          </span>
                          <span className="font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                            • {q.topic}
                          </span>
                        </div>

                        <button
                          onClick={() =>
                            setRevealedExplanations((prev) => ({
                              ...prev,
                              [q.id]: !prev[q.id],
                            }))
                          }
                          className="font-mono text-[10px] text-slate-400 hover:text-sky-300 border border-slate-800 hover:border-sky-800 px-3 py-1 uppercase tracking-widest transition-colors flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3 h-3 text-sky-400" />
                          {isExplanationShown ? "HIDE RESOLUTION" : "SEE RESOLUTION"}
                        </button>
                      </div>

                      {/* Question Text */}
                      <h3 className="text-xl sm:text-2xl text-slate-100 font-light leading-relaxed">
                        {q.text}
                      </h3>

                      {/* Options Feed */}
                      <div className="space-y-2 border-t border-slate-900 pt-6">
                        {q.options.map((opt) => {
                          const isSelected = userAns === opt.key;
                          const isCorrect = opt.key === q.correctKey;

                          let borderStyle = "border-slate-900/80 hover:border-slate-700 bg-slate-950/40";
                          let keyStyle = "border-slate-800 text-slate-500";
                          let badge = null;

                          if (isSelected) {
                            if (isCorrect) {
                              borderStyle = "border-emerald-700/80 bg-emerald-950/20 text-white";
                              keyStyle = "bg-emerald-900 text-emerald-200 border-emerald-700";
                              badge = <span className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest">✓ CORRECT CHOICE</span>;
                            } else {
                              borderStyle = "border-rose-900/80 bg-rose-950/20 text-slate-400 line-through";
                              keyStyle = "bg-rose-950 text-rose-300 border-rose-800";
                              badge = <span className="font-mono text-[10px] text-rose-400 uppercase tracking-widest">✕ INCORRECT CHOICE</span>;
                            }
                          } else if (isExplanationShown && isCorrect) {
                            borderStyle = "border-sky-900/60 bg-sky-950/20 text-slate-200";
                            keyStyle = "border-sky-800 text-sky-400";
                            badge = <span className="font-mono text-[10px] text-sky-400 uppercase tracking-widest">★ CORRECT SOLUTION</span>;
                          }

                          return (
                            <button
                              key={opt.key}
                              onClick={() =>
                                setLearnAnswers((prev) => ({ ...prev, [q.id]: opt.key }))
                              }
                              className={`w-full p-4 sm:p-5 border flex items-center justify-between text-left transition-all group ${borderStyle}`}
                            >
                              <div className="flex items-center gap-4">
                                <span className={`w-8 h-8 border text-xs font-mono flex items-center justify-center shrink-0 transition-colors ${keyStyle}`}>
                                  {opt.key}
                                </span>
                                <span className="text-base font-light text-slate-200">{opt.text}</span>
                              </div>
                              {badge && <div className="ml-4 shrink-0">{badge}</div>}
                            </button>
                          );
                        })}
                      </div>

                      {/* Verified Resolution Logic Box */}
                      {isExplanationShown && (
                        <div className="p-6 sm:p-8 border border-sky-900/60 bg-sky-950/20 relative overflow-hidden space-y-4">
                          <div className="absolute top-0 left-0 w-1 h-full bg-sky-400"></div>
                          <div className="flex items-center justify-between text-[10px] font-mono text-sky-400 uppercase tracking-widest">
                            <span className="flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-sky-400" /> RESOLUTION LOGIC & VERIFIED SOLUTION
                            </span>
                            <span className="text-slate-500">CORRECT ANSWER: OPTION {q.correctKey}</span>
                          </div>
                          <ResolutionText text={resolution.explanation} />

                          <AdditionalReadingResources resources={resolution.additionalReadings} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </main>

            {/* Quick Index Side Rail */}
            <aside className="bg-[#06080a] lg:h-[calc(100vh-65px)] lg:sticky lg:top-[65px] scrollbar-hide overflow-y-auto p-8 border-l border-slate-900">
              <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-6">
                // Question Quick Index
              </h3>
              <div className="grid grid-cols-4 gap-px bg-slate-900 border border-slate-900 mb-8">
                {activeQuestions.map((q, idx) => {
                  const isAns = !!learnAnswers[q.id];
                  const isExp = showAllExplanations || revealedExplanations[q.id];

                  let cellClass = "bg-[#06080a] text-slate-500 hover:bg-slate-900/60";
                  if (isAns) cellClass = "bg-sky-950 text-sky-300 font-bold border border-sky-800/60";
                  else if (isExp) cellClass = "bg-slate-900 text-slate-300";

                  return (
                    <a
                      key={q.id}
                      href={`#q-item-${idx + 1}`}
                      className={`h-10 flex items-center justify-center text-[10px] font-mono transition-all ${cellClass}`}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </a>
                  );
                })}
              </div>

              <div className="space-y-4 font-mono text-[10px] text-slate-500 tracking-widest uppercase border-t border-slate-900 pt-6">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-sky-950 border border-sky-800" /> Answered
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-[#06080a] border border-slate-900" /> Pending
                </div>
              </div>
            </aside>
          </div>
        ) : (
          /* VIEW MODE 2: SIMULATION MODE (One Question at a Time with Timer) */
          <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-4 border-t border-slate-900">
            {/* Main Question Interface */}
            <main className="lg:col-span-3 border-r border-slate-900 p-8 md:p-16 flex flex-col">
              <div className="flex items-center justify-between mb-12 border-b border-slate-900 pb-4">
                <span className="text-xs font-mono text-slate-500 uppercase tracking-[0.2em]">Query Parameter {currentIndex + 1}</span>
                <button
                  onClick={handleToggleFlag}
                  className={`flex items-center gap-2 text-[10px] font-mono px-3 py-1 border transition-colors tracking-widest uppercase ${
                    flagged[currentQ.id]
                      ? "bg-slate-200 text-black border-slate-200"
                      : "border-slate-800 text-slate-500 hover:text-white hover:border-slate-600"
                  }`}
                >
                  <Flag className="w-3 h-3" /> {flagged[currentQ.id] ? "FLG_ACTIVE" : "FLAG_QUERY"}
                </button>
              </div>

              <h2 className="text-2xl md:text-3xl lg:text-4xl font-light tracking-tight text-white mb-16 leading-relaxed">
                {currentQ.text}
              </h2>

              {/* Options List */}
              <div className="space-y-0.5 mb-16 border-t border-slate-900 pt-8" role="radiogroup">
                {currentQ.options.map((opt) => {
                  const isSelected = selectedKey === opt.key;
                  const isCorrect = opt.key === currentQ.correctKey;

                  let borderClass = "border-slate-900 hover:border-slate-700 hover:bg-slate-900/30";
                  let keyClass = "text-slate-600 border-slate-800";
                  
                  if (isAnsSubmitted) {
                      if (isCorrect) {
                        borderClass = "border-slate-300 bg-slate-900/50 text-white";
                        keyClass = "bg-white text-black border-white";
                      } else if (isSelected && !isCorrect) {
                        borderClass = "border-slate-800 text-slate-500 line-through opacity-50";
                        keyClass = "border-slate-700 text-slate-600";
                      } else {
                        borderClass = "border-slate-900 opacity-40";
                      }
                  } else if (isSelected) {
                      borderClass = "border-slate-500 bg-slate-900/50 text-white";
                      keyClass = "text-white border-slate-500";
                  }

                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSelectOption(opt.key)}
                      disabled={isAnsSubmitted}
                      className={`w-full p-6 border-b border-l-2 flex flex-col md:flex-row md:items-center text-left transition-all group ${borderClass} border-l-transparent`}
                      style={{ borderLeftColor: isSelected || (isAnsSubmitted && isCorrect) ? 'currentColor' : 'transparent' }}
                    >
                      <div className="flex items-start md:items-center gap-6 w-full">
                        <span className={`w-10 h-10 border text-xs font-mono flex items-center justify-center shrink-0 transition-colors ${keyClass}`}>
                          {opt.key}
                        </span>
                        <span className="text-lg font-light flex-1 pt-1 md:pt-0">{opt.text}</span>
                        
                        {isAnsSubmitted && isCorrect && <span className="font-mono tracking-widest text-[10px] text-white uppercase mt-4 md:mt-0">CORRECT</span>}
                        {isAnsSubmitted && isSelected && !isCorrect && <span className="font-mono tracking-widest text-[10px] text-slate-500 uppercase mt-4 md:mt-0">INVALID</span>}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Verified Explanation (Practice Mode) */}
              {mode === "practice" && isAnsSubmitted && (
                (() => {
                  const resolution = getQuestionResolution(currentQ);

                  return (
                    <div className="p-8 border border-slate-800 bg-slate-900/20 mb-16 relative overflow-hidden space-y-4">
                      <div className="absolute top-0 left-0 w-1 h-full bg-slate-300"></div>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-6">
                        <Sparkles className="w-3.5 h-3.5" /> Resolution Logic
                      </div>
                      <ResolutionText text={resolution.explanation} />
                      <AdditionalReadingResources resources={resolution.additionalReadings} />
                    </div>
                  );
                })()
              )}

              {/* Action Controls */}
              <div className="flex items-center justify-between mt-auto pt-8 border-t border-slate-900">
                <button
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="px-6 py-3 border border-slate-800 disabled:opacity-20 text-[10px] font-mono text-slate-400 uppercase tracking-widest hover:text-white hover:border-slate-600 transition-colors flex items-center gap-2"
                >
                  ← Prev Node
                </button>

                {mode === "practice" && !isAnsSubmitted ? (
                  <button
                    onClick={handleCheckAnswer}
                    disabled={!selectedKey}
                    className="px-8 py-3 border border-slate-400 disabled:opacity-20 disabled:border-slate-800 text-white text-[10px] uppercase tracking-widest transition-colors hover:bg-white hover:text-black font-mono"
                  >
                    EXECUTE QUERY
                  </button>
                ) : isLastQuestion ? (
                  <button
                    onClick={() => setStage("results")}
                    className="px-8 py-3 border border-emerald-500 bg-emerald-950/40 text-emerald-200 text-[10px] uppercase tracking-widest transition-colors hover:bg-emerald-400 hover:text-black hover:border-emerald-400 font-mono flex items-center gap-2"
                  >
                    SUBMIT SIMULATION →
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(activeQuestions.length - 1, prev + 1))}
                    className="px-8 py-3 border border-slate-500 text-white text-[10px] uppercase tracking-widest transition-colors hover:bg-white hover:text-black font-mono flex items-center gap-2"
                  >
                    Next Node →
                  </button>
                )}
              </div>
            </main>

            {/* Question Palette Sidebar */}
            <aside className="bg-[#06080a] lg:h-[calc(100vh-65px)] lg:sticky lg:top-[65px] scrollbar-hide overflow-y-auto">
              <div className="p-8 border-b border-slate-900">
                <h3 className="text-[10px] font-mono uppercase tracking-widest text-slate-500 mb-6">
                   Topology Matrix
                </h3>
                <div className="grid grid-cols-4 gap-px bg-slate-900 border border-slate-900">
                  {activeQuestions.map((q, idx) => {
                    const isCurrent = idx === currentIndex;
                    const isAns = !!answers[q.id];
                    const isFlag = !!flagged[q.id];

                    let cellClass = "bg-[#06080a] text-slate-500 hover:bg-slate-900/50";
                    if (isCurrent) cellClass = "bg-slate-800 text-white font-bold inset-ring-1 inset-ring-white";
                    else if (isAns) cellClass = "bg-slate-900/80 text-slate-300";
                    else if (isFlag) cellClass = "bg-slate-200 text-black font-bold";

                    return (
                      <button
                        key={q.id}
                        onClick={() => setCurrentIndex(idx)}
                        className={`h-12 flex items-center justify-center text-[10px] font-mono transition-all ${cellClass}`}
                      >
                        {String(idx + 1).padStart(2, '0')}
                      </button>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="mt-8 pt-8 border-t border-slate-900 space-y-4 text-[10px] font-mono text-slate-500 tracking-widest uppercase">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-slate-900/80 border border-slate-700" /> Resolved
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-slate-200" /> Flagged
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-[#06080a] border border-slate-900" /> Unresolved
                  </div>
                </div>
              </div>
            </aside>
          </div>
        )}
      </div>
    );
  }

  // ── 3. Results & Mastery Analytics Stage ──
  const { correct, attempted, total } = calculateScore();
  const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      <div className="px-6 pt-12 flex justify-between items-center max-w-[1200px] mx-auto mb-24">
        <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
          ← ABORT TO MATRIX
        </Link>
      </div>

      <main className="max-w-[1200px] mx-auto px-6">
        <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-24 border-b border-slate-900 pb-4 flex items-center justify-between">
          <div>
            <span className="text-white">SESSION COMPLETE</span>
            <span className="mx-4 text-slate-700">/</span>
            <span className="text-slate-500">TELEMETRY ANALYSIS</span>
          </div>
          <span className="text-green-500 font-bold hidden md:inline">SYSTEM CAPTURE: SUCCESS</span>
        </div>

        {/* High-Contrast Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-900 border-t border-b border-slate-900 mb-24">
          <div className="bg-[#06080a] p-12 text-center flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-6">Execution Accuracy</span>
            <span className="text-6xl md:text-8xl font-light text-white tracking-tighter mb-2">{accuracyPct}<span className="text-3xl text-slate-600">%</span></span>
          </div>

          <div className="bg-[#06080a] p-12 text-center flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-6">Valid Vectors</span>
            <span className="text-6xl md:text-8xl font-light text-slate-300 tracking-tighter mb-2">{correct}<span className="text-3xl text-slate-600">/{total}</span></span>
          </div>

          <div className="bg-[#06080a] p-12 text-center flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-widest text-slate-600 mb-6">Duration</span>
            <span className="text-6xl md:text-8xl font-light text-slate-300 tracking-tighter mb-2">{formatTime(timerSeconds)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
          {/* Topic Breakdown */}
          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
              // Topological Decay Analysis
            </h2>
            <div className="space-y-6">
              <div className="border-b border-slate-900/50 pb-6">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-widest uppercase mb-4">
                  <span className="text-slate-300">Elasticity & Hooke's Law</span>
                  <span className="text-slate-500">2/2 VOL</span>
                </div>
                <div className="w-full bg-[#06080a] h-1 border border-slate-800">
                  <div className="bg-slate-300 h-full w-full" />
                </div>
              </div>

              <div className="border-b border-slate-900/50 pb-6">
                <div className="flex items-center justify-between text-[10px] font-mono tracking-widest uppercase mb-4">
                  <span className="text-slate-300">Bending Moments & Shear Force</span>
                  <span className="text-slate-500">1/2 VOL</span>
                </div>
                <div className="w-full bg-[#06080a] h-1 border border-slate-800">
                  <div className="bg-slate-500 h-full w-1/2" />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2">
            <h2 className="font-mono text-xs uppercase tracking-[0.3em] text-slate-600 mb-8 border-b border-slate-900 pb-2">
              // Protocol Operations
            </h2>
            <div className="flex flex-col gap-4">
               <button
                  onClick={() => {
                    setStage("setup");
                    setAnswers({});
                    setSubmitted({});
                    setFlagged({});
                  }}
                  className="w-full p-6 text-left border border-slate-700 hover:border-white transition-colors group flex items-center justify-between"
               >
                 <div>
                    <div className="font-mono text-[10px] tracking-widest text-slate-500 uppercase mb-2">Operation 01</div>
                    <div className="text-xl font-light text-slate-300 group-hover:text-white transition-colors">Re-Initialize Sequence</div>
                 </div>
                 <span className="font-mono text-xs text-slate-600 group-hover:text-white">→</span >
               </button>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
