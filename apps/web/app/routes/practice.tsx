import React, { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
} from "lucide-react";

export const Route = createFileRoute("/practice")({
  head: () => ({
    meta: [
      { title: "Practice & Mock Exam Hub — Prepora" },
      { name: "description", content: "Distraction-free exam practice and mock test environment with real-time analytics and instant verified explanations." },
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
  const [mode, setMode] = useState<Mode>("practice");
  const [stage, setStage] = useState<Stage>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (stage === "active") {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [stage]);

  const currentQ = DEMO_QUESTIONS[currentIndex];

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
    DEMO_QUESTIONS.forEach((q) => {
      if (answers[q.id]) {
        attempted++;
        if (answers[q.id] === q.correctKey) correct++;
      }
    });
    return { correct, attempted, total: DEMO_QUESTIONS.length };
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── 1. Setup Stage ──
  if (stage === "setup") {
    return (
      <div className="min-h-screen bg-[#080c14] text-slate-100 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-950/60 border border-blue-800/60 text-blue-400 text-xs font-mono mb-4">
            <Zap className="w-3.5 h-3.5" /> High-Yield Practice Hub
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-4">
            Exam Practice & Mock Tests
          </h1>
          <p className="text-sm text-slate-400 mb-8 max-w-lg mx-auto">
            Choose your learning mode. Instant feedback with step-by-step explanations or full exam simulation under timed conditions.
          </p>

          {/* Mode Switcher */}
          <div className="grid grid-cols-2 gap-4 p-1.5 rounded-2xl bg-slate-900/80 border border-slate-800 mb-8">
            <button
              onClick={() => setMode("practice")}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === "practice"
                  ? "bg-slate-950 border-blue-500/80 shadow-md text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" /> Untimed Practice
              </div>
              <p className="text-xs text-slate-400">Immediate answer feedback & progressive explanations after every question.</p>
            </button>

            <button
              onClick={() => setMode("mock")}
              className={`p-4 rounded-xl border text-left transition-all ${
                mode === "mock"
                  ? "bg-slate-950 border-blue-500/80 shadow-md text-white"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <div className="font-semibold text-sm mb-1 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" /> Full Mock Exam
              </div>
              <p className="text-xs text-slate-400">Simulate official test conditions with live countdown timer & summary score.</p>
            </button>
          </div>

          {/* Configuration Card */}
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-left space-y-4 mb-8">
            <div>
              <label htmlFor="exam-select" className="text-xs font-mono text-slate-400 block mb-1.5">Select Target Exam</label>
              <select
                id="exam-select"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option>Kerala PSC — Assistant Engineer (Civil)</option>
                <option>GATE Civil Engineering (2026)</option>
                <option>SSC JE Civil (Paper 1)</option>
              </select>
            </div>

            <div>
              <label htmlFor="subject-select" className="text-xs font-mono text-slate-400 block mb-1.5">Subject / Topic Focus</label>
              <select
                id="subject-select"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              >
                <option>All Subjects (Full Syllabus)</option>
                <option>Strength of Materials</option>
                <option>Concrete Technology & RCC</option>
                <option>Structural Analysis</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              setStage("active");
              setTimerSeconds(0);
            }}
            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            Start {mode === "practice" ? "Practice Session" : "Mock Test"} →
          </button>
        </div>
      </div>
    );
  }

  // ── 2. Active Session Stage ──
  if (stage === "active") {
    const isAnsSubmitted = mode === "practice" ? submitted[currentQ.id] : false;
    const selectedKey = answers[currentQ.id];

    return (
      <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col">
        {/* Top Minimal Header */}
        <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
              Q {currentIndex + 1} / {DEMO_QUESTIONS.length}
            </span>
            <span className="text-xs font-mono text-slate-400 hidden sm:inline">{currentQ.topic}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 px-3 py-1 rounded bg-slate-900 border border-slate-800">
              <Clock className="w-3.5 h-3.5 text-blue-400" /> {formatTime(timerSeconds)}
            </div>

            <button
              onClick={() => setStage("results")}
              className="px-3.5 py-1.5 rounded-lg border border-slate-800 hover:bg-slate-900 text-xs font-semibold text-slate-300 transition-colors"
            >
              Finish & Submit
            </button>
          </div>
        </header>

        <div className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Question Interface */}
          <main className="lg:col-span-3 space-y-6">
            <div className="p-6 sm:p-8 rounded-2xl border border-slate-800 bg-slate-900/40">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono text-slate-500 uppercase">Question {currentIndex + 1}</span>
                <button
                  onClick={handleToggleFlag}
                  className={`flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded border transition-colors ${
                    flagged[currentQ.id]
                      ? "bg-amber-950/60 border-amber-800/80 text-amber-400"
                      : "border-slate-800 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Flag className="w-3 h-3" /> {flagged[currentQ.id] ? "Flagged" : "Flag"}
                </button>
              </div>

              <h2 className="text-lg sm:text-xl font-medium tracking-tight text-white mb-6 leading-relaxed">
                {currentQ.text}
              </h2>

              {/* Options List */}
              <div className="space-y-3 mb-8" role="radiogroup">
                {currentQ.options.map((opt) => {
                  const isSelected = selectedKey === opt.key;
                  const isCorrect = opt.key === currentQ.correctKey;

                  let borderClass = "border-slate-800/80 bg-slate-950/60 hover:border-slate-700";
                  let keyClass = "bg-slate-900 border-slate-800 text-slate-400";

                  if (isAnsSubmitted) {
                    if (isCorrect) {
                      borderClass = "border-emerald-500/80 bg-emerald-950/30 text-emerald-200";
                      keyClass = "bg-emerald-600 text-white border-emerald-500";
                    } else if (isSelected && !isCorrect) {
                      borderClass = "border-rose-500/80 bg-rose-950/30 text-rose-200";
                      keyClass = "bg-rose-600 text-white border-rose-500";
                    } else {
                      borderClass = "border-slate-800/40 opacity-50";
                    }
                  } else if (isSelected) {
                    borderClass = "border-blue-500/80 bg-blue-950/30 text-white ring-1 ring-blue-500/80";
                    keyClass = "bg-blue-600 text-white border-blue-500";
                  }

                  return (
                    <button
                      key={opt.key}
                      onClick={() => handleSelectOption(opt.key)}
                      disabled={isAnsSubmitted}
                      className={`w-full p-4 rounded-xl border flex items-center justify-between text-left transition-all ${borderClass}`}
                    >
                      <div className="flex items-center gap-3.5">
                        <span className={`w-7 h-7 rounded-lg border text-xs font-mono font-bold flex items-center justify-center shrink-0 ${keyClass}`}>
                          {opt.key}
                        </span>
                        <span className="text-sm font-medium">{opt.text}</span>
                      </div>
                      {isAnsSubmitted && isCorrect && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                      {isAnsSubmitted && isSelected && !isCorrect && <XCircle className="w-5 h-5 text-rose-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              {/* Action Controls */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-800/80">
                <button
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="px-4 py-2 rounded-xl border border-slate-800 disabled:opacity-40 text-xs font-mono text-slate-300 hover:bg-slate-900 transition-colors flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>

                {mode === "practice" && !isAnsSubmitted ? (
                  <button
                    onClick={handleCheckAnswer}
                    disabled={!selectedKey}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors"
                  >
                    Submit Answer
                  </button>
                ) : (
                  <button
                    onClick={() => setCurrentIndex((prev) => Math.min(DEMO_QUESTIONS.length - 1, prev + 1))}
                    disabled={currentIndex === DEMO_QUESTIONS.length - 1}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition-colors flex items-center gap-1"
                  >
                    Next <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Verified Explanation (Practice Mode) */}
            {mode === "practice" && isAnsSubmitted && (
              <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/50 space-y-3 animate-fade-up">
                <div className="flex items-center gap-2 text-xs font-mono text-blue-400 uppercase">
                  <Sparkles className="w-4 h-4" /> Verified Explanation
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{currentQ.explanation}</p>
              </div>
            )}
          </main>

          {/* Question Palette Sidebar */}
          <aside className="space-y-6">
            <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/40">
              <h3 className="text-xs font-mono uppercase text-slate-400 mb-4 flex items-center gap-2">
                <Grid className="w-3.5 h-3.5" /> Question Palette
              </h3>
              <div className="grid grid-cols-5 gap-2">
                {DEMO_QUESTIONS.map((q, idx) => {
                  const isCurrent = idx === currentIndex;
                  const isAns = !!answers[q.id];
                  const isFlag = !!flagged[q.id];

                  let cellClass = "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700";
                  if (isCurrent) cellClass = "border-blue-500 text-blue-400 ring-1 ring-blue-500";
                  else if (isAns) cellClass = "bg-blue-950/60 border-blue-800/80 text-blue-300";
                  else if (isFlag) cellClass = "bg-amber-950/60 border-amber-800/80 text-amber-300";

                  return (
                    <button
                      key={q.id}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-9 rounded-lg border text-xs font-mono font-bold transition-all ${cellClass}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-6 pt-4 border-t border-slate-800/80 space-y-2 text-[11px] font-mono text-slate-400">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-blue-950 border border-blue-800" /> Answered
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-amber-950 border border-amber-800" /> Flagged
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-slate-950 border border-slate-800" /> Unvisited
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ── 3. Results & Mastery Analytics Stage ──
  const { correct, attempted, total } = calculateScore();
  const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 py-16 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 text-xs font-mono mb-4">
          <BarChart2 className="w-3.5 h-3.5" /> Performance Report
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white mb-2">
          Session Summary
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          Detailed metrics & topic breakdown without fluff.
        </p>

        {/* High-Contrast Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-center">
            <div className="text-3xl font-bold text-emerald-400 mb-1 font-mono">{correct} / {total}</div>
            <div className="text-xs font-mono text-slate-400 uppercase">Correct Answers</div>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-center">
            <div className="text-3xl font-bold text-blue-400 mb-1 font-mono">{accuracyPct}%</div>
            <div className="text-xs font-mono text-slate-400 uppercase">Accuracy Rate</div>
          </div>

          <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-center">
            <div className="text-3xl font-bold text-slate-200 mb-1 font-mono">{formatTime(timerSeconds)}</div>
            <div className="text-xs font-mono text-slate-400 uppercase">Total Time Spent</div>
          </div>
        </div>

        {/* Topic Breakdown */}
        <div className="p-6 rounded-2xl border border-slate-800 bg-slate-900/40 text-left mb-8 space-y-4">
          <h3 className="text-xs font-mono uppercase text-slate-400 mb-2">Topic Breakdown</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm font-mono">
              <span className="text-slate-300">Elasticity & Hooke's Law</span>
              <span className="text-emerald-400">100% (2/2)</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div className="bg-emerald-500 h-full w-full" />
            </div>

            <div className="flex items-center justify-between text-sm font-mono pt-2">
              <span className="text-slate-300">Bending Moments & Shear Force</span>
              <span className="text-amber-400">50% (1/2)</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
              <div className="bg-amber-500 h-full w-1/2" />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={() => {
              setStage("setup");
              setAnswers({});
              setSubmitted({});
              setFlagged({});
            }}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/20"
          >
            Start Another Session
          </button>
        </div>
      </div>
    </div>
  );
}

