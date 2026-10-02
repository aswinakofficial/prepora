import { formatNumericRange, gradeNumericAnswer } from "@prepora/api/src/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { BookOpen, Clock, ExternalLink, Flag, Sparkles, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  type AdditionalReadingResource,
  mergeReadingResources,
  splitExplanationAndReadings,
} from "../../lib/additional-reading";
import { trackEvent } from "../../lib/analytics";
import { getAnonymousSessionId } from "../../lib/anonymous-session";
import {
  formatKeys,
  isSelectionComplete,
  isSelectionCorrect,
  requiredSelections,
  toggleSelection,
} from "../../lib/answer-selection";
import { canonicalLink } from "../../lib/json-ld";
import { orpc } from "../../lib/orpc";
import { type QuestionImage, QuestionImages } from "../components/question/QuestionImages";
import { placeholderKeys, Skeleton, SkeletonRegion } from "../components/ui/Skeleton";

const practiceSearchSchema = z.object({
  examSlug: z.string().optional(),
  q: z.number().optional(),
  viewMode: z.enum(["simulation", "learn"]).optional(),
});

export const Route = createFileRoute("/practice")({
  validateSearch: (search) => practiceSearchSchema.parse(search),
  // A practice session is always for one exam. Links that arrive without one (the footer's
  // "Practice", topic and question-set pages) used to land on a setup screen whose exam and
  // subject dropdowns were hard-coded placeholders wired to nothing, so starting from it gave a
  // session with zero questions. Pick an exam from the directory instead.
  beforeLoad: ({ search }) => {
    if (!search.examSlug) throw redirect({ to: "/exams" });
  },
  head: () => ({
    meta: [
      { title: "Practice & Learn Exam Hub — Prepora" },
      {
        name: "description",
        content:
          "Distraction-free exam practice and Learn Mode with verified step-by-step explanations.",
      },
    ],
    // Canonicalizes to the base path regardless of ?examSlug=/?viewMode= — this is an interactive
    // session UI, not per-parameter indexable content.
    links: [canonicalLink("/practice")],
  }),
  component: PracticePage,
});

type Stage = "active" | "results";

interface Question {
  id: string;
  text: string;
  options: { id: string; key: string; text: string }[];
  correctKey: string;
  /** Every correct option — more than one for a "Choose N" question. */
  correctKeys?: string[];
  questionType?: string;
  /** A numerical question's accepted ranges, inclusive (docs/specs/03-paper-structure-min.md). */
  numericRanges?: Array<[number, number]>;
  /** A numerical question's answer as the key prints it. */
  numericAnswer?: string | null;
  /** False when the key leaves nothing to score (marks to all, dropped, cancelled). */
  hasAnswer?: boolean;
  /** Whether this paper's key scored the question. */
  answerStatus?: string;
  explanation: string;
  images?: QuestionImage[];
  topic: string;
  additionalReading?: string | string[];
  additionalReadings?: string[];
  additionalReadingLinks?: Array<{ text: string; url?: string }>;
}

function getQuestionResolution(question: Question) {
  const extracted = splitExplanationAndReadings(question.explanation || "");

  const additionalReadings = mergeReadingResources({
    rawReadings: question.additionalReadings || question.additionalReading,
    readingLinks: [...extracted.readings, ...(question.additionalReadingLinks || [])],
  });

  return {
    // docs/roadmap/engineering-roadmap.md item 25: a real published question can genuinely have
    // no explanation (the column is nullable) — this used to fall through to
    // `question.explanation` (null) whenever `extracted.explanation` was also falsy, and
    // ResolutionText's `text.split(...)` crashed on a null prop. Fixture data always had a
    // non-empty explanation, so this never surfaced before real data flowed through here.
    explanation: extracted.explanation || question.explanation || "",
    additionalReadings,
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
              {body.trim() && <p className="whitespace-pre-line">{body.trim()}</p>}
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
        {resources.map((resource) => (
          <li
            key={resource.url || resource.text}
            className="text-sm text-slate-300 leading-relaxed"
          >
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

function PracticePage() {
  const search = Route.useSearch();
  const examSlug = search?.examSlug;
  const initialQ = search?.q;

  const [viewMode, setViewMode] = useState<"simulation" | "learn">(
    search?.viewMode === "learn" ? "learn" : "simulation",
  );
  const [stage, setStage] = useState<Stage>("active");
  const [currentIndex, setCurrentIndex] = useState(0);
  // A selection per question is a list of option keys (one for single-answer questions, N for
  // "Choose N") — see lib/answer-selection.ts.
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [flagged, setFlagged] = useState<Record<string, boolean>>({});
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Learn Mode specific states
  const [showAllExplanations, setShowAllExplanations] = useState(false);
  const [revealedExplanations, setRevealedExplanations] = useState<Record<string, boolean>>({});
  const [learnAnswers, setLearnAnswers] = useState<Record<string, string[]>>({});
  // Learn mode records a question's attempt once — the first time its answer is complete — not
  // again every time the user changes their selection afterwards.
  const [learnRecorded, setLearnRecorded] = useState<Record<string, boolean>>({});
  // A numerical answer being typed in Learn mode, checked only when asked — a selection is
  // checked as soon as it's complete, which for a typed answer would be its first keystroke.
  const [learnDrafts, setLearnDrafts] = useState<Record<string, string>>({});

  const { data: realExamData, isLoading: isLoadingExam } = useQuery(
    orpc.exams.getBySlug.queryOptions({ input: { examSlug: examSlug || "" } }),
  );

  const examQuestions: Question[] = (realExamData?.questions as any) ?? [];
  // A question whose key gave marks to everyone, or dropped or cancelled it, has nothing to
  // practise against: it's skipped, and counted as "not scored" in the results. That's decided per
  // paper (an occurrence), since the same question can be scored in another paper.
  const activeQuestions = useMemo(
    () =>
      examQuestions.filter(
        (q) => q.hasAnswer !== false && (q.answerStatus ?? "scored") === "scored",
      ),
    [examQuestions],
  );
  const notScored = examQuestions.length - activeQuestions.length;

  // docs/roadmap/engineering-roadmap.md item 25: results now persist server-side instead of
  // living only in this component's React state. `correctKey` on each question is still sent by
  // exams.getBySlug and still drives this page's *immediate* UI feedback (unchanged from item 24,
  // deliberately — see catalog-questions.ts's loadQuestionsWithAnswers docstring), but the
  // authoritative, persisted record of what happened comes from the server-verified
  // questions.submitAnswer call fired alongside it. An anonymous sessionId (persisted in
  // localStorage) stands in for a signed-in userId so practice works signed-out and accumulates
  // across visits from the same browser.
  const anonymousSessionId = useMemo(() => getAnonymousSessionId(), []);
  const [practiceSessionId, setPracticeSessionId] = useState<string | null>(null);
  const { mutate: startPracticeSession } = useMutation(
    orpc.questions.startPracticeSession.mutationOptions(),
  );
  const { mutate: submitAnswer } = useMutation(orpc.questions.submitAnswer.mutationOptions());
  const { mutate: completePracticeSession } = useMutation(
    orpc.questions.completePracticeSession.mutationOptions(),
  );

  useEffect(() => {
    if (initialQ && initialQ > 0 && initialQ <= activeQuestions.length) {
      setCurrentIndex(initialQ - 1);
    }
  }, [initialQ, activeQuestions.length]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    // Not while the questions are still loading — the session clock starts with the session.
    if (stage === "active" && activeQuestions.length > 0) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [stage, activeQuestions.length]);

  // Created once real questions are known, so totalQuestions is accurate.
  useEffect(() => {
    if (stage === "active" && activeQuestions.length > 0 && !practiceSessionId) {
      startPracticeSession(
        { mode: "practice", totalQuestions: activeQuestions.length, sessionId: anonymousSessionId },
        {
          onSuccess: (res) => {
            setPracticeSessionId(res.id);
            trackEvent("practice_start", { entityType: "practice_session", entityId: res.id });
          },
        },
      );
    }
  }, [stage, activeQuestions.length, practiceSessionId, anonymousSessionId, startPracticeSession]);

  const currentQ = activeQuestions[currentIndex] || activeQuestions[0];

  // Fire-and-forget: keeps the interaction optimistic (the UI never waits on this) while still
  // giving every answer a real, server-verified attempts row.
  const recordAttempt = (question: Question, optionKeys: string[]) => {
    if (isNumerical(question)) {
      if (!optionKeys[0]) return;
      submitAnswer({
        id: question.id,
        numericAnswer: optionKeys[0],
        sessionId: anonymousSessionId,
        practiceSessionId: practiceSessionId ?? undefined,
      });
      trackEvent("answer_reveal", { entityType: "question", entityId: question.id });
      return;
    }
    const optionIds = question.options.filter((o) => optionKeys.includes(o.key)).map((o) => o.id);
    if (optionIds.length === 0) return;
    submitAnswer({
      id: question.id,
      selectedOptionIds: optionIds,
      sessionId: anonymousSessionId,
      practiceSessionId: practiceSessionId ?? undefined,
    });
    trackEvent("answer_reveal", { entityType: "question", entityId: question.id });
  };

  const handleSelectOption = (key: string) => {
    if (submitted[currentQ.id]) return;
    // The attempt is recorded from handleCheckAnswer, once the user has asked to see whether
    // they were right.
    setAnswers((prev) => ({
      ...prev,
      [currentQ.id]: toggleSelection(prev[currentQ.id] ?? [], key, requiredSelections(currentQ)),
    }));
  };

  const handleCheckAnswer = () => {
    if (isSelectionComplete(answers[currentQ.id], requiredSelections(currentQ))) {
      setSubmitted((prev) => ({ ...prev, [currentQ.id]: true }));
      recordAttempt(currentQ, answers[currentQ.id]);
    }
  };

  const handleToggleFlag = () => {
    setFlagged((prev) => ({ ...prev, [currentQ.id]: !prev[currentQ.id] }));
  };

  const calculateScore = () => {
    let correct = 0;
    let attempted = 0;
    activeQuestions.forEach((q) => {
      if (answers[q.id]?.length) {
        attempted++;
        if (isAnswerCorrect(q, answers[q.id])) correct++;
      }
    });
    return { correct, attempted, total: activeQuestions.length };
  };

  const handleFinishSession = () => {
    if (practiceSessionId) {
      const { correct, attempted, total } = calculateScore();
      completePracticeSession({
        id: practiceSessionId,
        correct,
        incorrect: attempted - correct,
        skipped: total - attempted,
        timeTakenSeconds: timerSeconds,
      });
      trackEvent("practice_complete", {
        entityType: "practice_session",
        entityId: practiceSessionId,
        meta: { correct, attempted, total, timeTakenSeconds: timerSeconds },
      });
    }
    setStage("results");
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // ── 2. Active Session Stage ──
  if (stage === "active") {
    // While the exam loads, show the session's shape — not "no published questions yet", which
    // is what an empty question list used to render until the data arrived.
    if (isLoadingExam) {
      return <PracticeSessionSkeleton mode={viewMode} />;
    }
    if (activeQuestions.length === 0) {
      return (
        <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white flex flex-col items-center justify-center px-6 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-slate-500 mb-4">
            No published questions yet
          </p>
          <h1 className="text-2xl md:text-3xl text-white font-light tracking-tight mb-8 max-w-lg">
            {examSlug
              ? `${realExamData?.name || examSlug} doesn't have any published questions yet.`
              : "Select an exam to begin practicing."}
          </h1>
          <Link
            to="/exams"
            className="font-mono text-xs uppercase tracking-widest text-black bg-white hover:bg-slate-200 px-6 py-3 font-semibold transition-colors"
          >
            Browse exams
          </Link>
        </div>
      );
    }

    const isAnsSubmitted = submitted[currentQ.id];
    const selectedKeys = answers[currentQ.id] ?? [];
    const currentCorrectKeys = correctKeysOf(currentQ);
    const currentRequired = requiredSelections(currentQ);
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
              type="button"
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
              type="button"
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
                type="button"
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
              type="button"
              onClick={handleFinishSession}
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
                    {/* LEARN MODE ARCHIVE VIEW */}
                  </span>
                  <h1 className="text-3xl md:text-4xl text-white font-light tracking-tight">
                    Full Question & Resolution Matrix ({activeQuestions.length})
                  </h1>
                </div>
                <button
                  type="button"
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
                  const userAns = learnAnswers[q.id] ?? [];
                  const correctKeys = correctKeysOf(q);
                  const required = requiredSelections(q);
                  // A "Choose N" answer is only checked once N options are chosen — revealing it
                  // on the first click gave the answer away.
                  const isAnswered = isSelectionComplete(userAns, required);
                  const isExplanationShown =
                    showAllExplanations || revealedExplanations[q.id] || isAnswered;
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
                          type="button"
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
                      <h3 className="text-xl sm:text-2xl text-slate-100 font-light leading-relaxed whitespace-pre-line">
                        {q.text}
                      </h3>
                      <QuestionImages images={q.images} placement="question" />
                      <SelectionHint required={required} selected={userAns.length} />

                      {isNumerical(q) && (
                        <div className="border-t border-slate-900 pt-6">
                          <NumericAnswerField
                            id={`numeric-${q.id}`}
                            value={isAnswered ? userAns[0] : (learnDrafts[q.id] ?? "")}
                            onChange={(value) =>
                              setLearnDrafts((prev) => ({ ...prev, [q.id]: value }))
                            }
                            onCheck={() => {
                              const typed = (learnDrafts[q.id] ?? "").trim();
                              if (!typed || isAnswered) return;
                              setLearnAnswers((prev) => ({ ...prev, [q.id]: [typed] }));
                              if (!learnRecorded[q.id]) {
                                recordAttempt(q, [typed]);
                                setLearnRecorded((prev) => ({ ...prev, [q.id]: true }));
                              }
                            }}
                            checked={isAnswered}
                            correct={isAnswered && isAnswerCorrect(q, userAns)}
                          />
                        </div>
                      )}

                      {/* Options Feed */}
                      <div
                        className={`space-y-2 border-t border-slate-900 pt-6 ${q.options.length === 0 ? "hidden" : ""}`}
                      >
                        {q.options.map((opt) => {
                          const isSelected = userAns.includes(opt.key);
                          const isCorrect = correctKeys.includes(opt.key);

                          let borderStyle =
                            "border-slate-900/80 hover:border-slate-700 bg-slate-950/40";
                          let keyStyle = "border-slate-800 text-slate-500";
                          let badge = null;

                          if (isSelected && !isExplanationShown) {
                            // Part-way through a "Choose N": chosen, not yet checked.
                            borderStyle = "border-sky-700/80 bg-sky-950/20 text-white";
                            keyStyle = "bg-sky-900 text-sky-100 border-sky-600";
                          } else if (isSelected) {
                            if (isCorrect) {
                              borderStyle = "border-emerald-700/80 bg-emerald-950/20 text-white";
                              keyStyle = "bg-emerald-900 text-emerald-200 border-emerald-700";
                              badge = (
                                <span className="font-mono text-[10px] text-emerald-400 uppercase tracking-widest">
                                  ✓ CORRECT CHOICE
                                </span>
                              );
                            } else {
                              borderStyle =
                                "border-rose-900/80 bg-rose-950/20 text-slate-400 line-through";
                              keyStyle = "bg-rose-950 text-rose-300 border-rose-800";
                              badge = (
                                <span className="font-mono text-[10px] text-rose-400 uppercase tracking-widest">
                                  ✕ INCORRECT CHOICE
                                </span>
                              );
                            }
                          } else if (isExplanationShown && isCorrect) {
                            borderStyle = "border-sky-900/60 bg-sky-950/20 text-slate-200";
                            keyStyle = "border-sky-800 text-sky-400";
                            badge = (
                              <span className="font-mono text-[10px] text-sky-400 uppercase tracking-widest">
                                ★ CORRECT SOLUTION
                              </span>
                            );
                          }

                          return (
                            <button
                              type="button"
                              key={opt.key}
                              aria-pressed={isSelected}
                              onClick={() => {
                                const next = toggleSelection(userAns, opt.key, required);
                                setLearnAnswers((prev) => ({ ...prev, [q.id]: next }));
                                if (isSelectionComplete(next, required) && !learnRecorded[q.id]) {
                                  recordAttempt(q, next);
                                  setLearnRecorded((prev) => ({ ...prev, [q.id]: true }));
                                }
                              }}
                              className={`w-full p-4 sm:p-5 border flex items-center justify-between text-left transition-all group ${borderStyle}`}
                            >
                              <div className="flex items-center gap-4">
                                <span
                                  className={`w-8 h-8 border text-xs font-mono flex items-center justify-center shrink-0 transition-colors ${keyStyle}`}
                                >
                                  {opt.key}
                                </span>
                                <span className="text-base font-light text-slate-200">
                                  {opt.text}
                                  <QuestionImages
                                    images={q.images}
                                    placement="option"
                                    optionKey={opt.key}
                                    className="mt-2"
                                  />
                                </span>
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
                              <Sparkles className="w-3.5 h-3.5 text-sky-400" /> RESOLUTION LOGIC &
                              VERIFIED SOLUTION
                            </span>
                            <span className="text-slate-500">
                              {isNumerical(q) ? (
                                <>ACCEPTED: {acceptedNumeric(q)}</>
                              ) : (
                                <>
                                  CORRECT ANSWER: {correctKeys.length > 1 ? "OPTIONS" : "OPTION"}{" "}
                                  {formatKeys(correctKeys)}
                                </>
                              )}
                            </span>
                          </div>
                          <ResolutionText text={resolution.explanation} />
                          <QuestionImages
                            images={q.images}
                            placement="explanation"
                            className="mt-4"
                          />

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
                {/* Question Quick Index */}
              </h3>
              <div className="grid grid-cols-4 gap-px bg-slate-900 border border-slate-900 mb-8">
                {activeQuestions.map((q, idx) => {
                  const isAns = isSelectionComplete(learnAnswers[q.id], requiredSelections(q));
                  const isExp = showAllExplanations || revealedExplanations[q.id];

                  let cellClass = "bg-[#06080a] text-slate-500 hover:bg-slate-900/60";
                  if (isAns)
                    cellClass = "bg-sky-950 text-sky-300 font-bold border border-sky-800/60";
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
                <span className="text-xs font-mono text-slate-500 uppercase tracking-[0.2em]">
                  Query Parameter {currentIndex + 1}
                </span>
                <button
                  type="button"
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

              <h2 className="text-2xl md:text-3xl lg:text-4xl font-light tracking-tight text-white mb-16 leading-relaxed whitespace-pre-line">
                {currentQ.text}
              </h2>
              <QuestionImages
                images={currentQ.images}
                placement="question"
                className="-mt-10 mb-16"
              />

              <SelectionHint
                required={currentRequired}
                selected={selectedKeys.length}
                className="-mt-10 mb-8"
              />

              {isNumerical(currentQ) && (
                <div className="mb-16 border-t border-slate-900 pt-8">
                  <NumericAnswerField
                    id={`numeric-${currentQ.id}`}
                    value={selectedKeys[0] ?? ""}
                    onChange={(value) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [currentQ.id]: value.trim() ? [value] : [],
                      }))
                    }
                    onCheck={handleCheckAnswer}
                    checked={!!isAnsSubmitted}
                    correct={!!isAnsSubmitted && isAnswerCorrect(currentQ, selectedKeys)}
                    accepted={isAnsSubmitted ? acceptedNumeric(currentQ) : null}
                    // Simulation checks through its own "Execute query" control.
                    showCheckButton={false}
                  />
                </div>
              )}

              {/* Options List */}
              <div
                className={`space-y-0.5 mb-16 border-t border-slate-900 pt-8 ${currentQ.options.length === 0 ? "hidden" : ""}`}
              >
                {currentQ.options.map((opt) => {
                  const isSelected = selectedKeys.includes(opt.key);
                  const isCorrect = currentCorrectKeys.includes(opt.key);

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
                      type="button"
                      key={opt.key}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectOption(opt.key)}
                      disabled={isAnsSubmitted}
                      className={`w-full p-6 border-b border-l-2 flex flex-col md:flex-row md:items-center text-left transition-all group ${borderClass} border-l-transparent`}
                      style={{
                        borderLeftColor:
                          isSelected || (isAnsSubmitted && isCorrect)
                            ? "currentColor"
                            : "transparent",
                      }}
                    >
                      <div className="flex items-start md:items-center gap-6 w-full">
                        <span
                          className={`w-10 h-10 border text-xs font-mono flex items-center justify-center shrink-0 transition-colors ${keyClass}`}
                        >
                          {opt.key}
                        </span>
                        <span className="text-lg font-light flex-1 pt-1 md:pt-0">
                          {opt.text}
                          <QuestionImages
                            images={currentQ.images}
                            placement="option"
                            optionKey={opt.key}
                            className="mt-3"
                          />
                        </span>

                        {isAnsSubmitted && isCorrect && (
                          <span className="font-mono tracking-widest text-[10px] text-white uppercase mt-4 md:mt-0">
                            CORRECT
                          </span>
                        )}
                        {isAnsSubmitted && isSelected && !isCorrect && (
                          <span className="font-mono tracking-widest text-[10px] text-slate-500 uppercase mt-4 md:mt-0">
                            INVALID
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Verified Explanation */}
              {isAnsSubmitted &&
                (() => {
                  const resolution = getQuestionResolution(currentQ);

                  return (
                    <div className="p-8 border border-slate-800 bg-slate-900/20 mb-16 relative overflow-hidden space-y-4">
                      <div className="absolute top-0 left-0 w-1 h-full bg-slate-300"></div>
                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400 uppercase tracking-widest mb-6">
                        <Sparkles className="w-3.5 h-3.5" /> Resolution Logic
                      </div>
                      <ResolutionText text={resolution.explanation} />
                      <QuestionImages
                        images={currentQ.images}
                        placement="explanation"
                        className="mt-4"
                      />
                      <AdditionalReadingResources resources={resolution.additionalReadings} />
                    </div>
                  );
                })()}

              {/* Action Controls */}
              <div className="flex items-center justify-between mt-auto pt-8 border-t border-slate-900">
                <button
                  type="button"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  disabled={currentIndex === 0}
                  className="px-6 py-3 border border-slate-800 disabled:opacity-20 text-[10px] font-mono text-slate-400 uppercase tracking-widest hover:text-white hover:border-slate-600 transition-colors flex items-center gap-2"
                >
                  ← Prev Node
                </button>

                {!isAnsSubmitted ? (
                  <button
                    type="button"
                    onClick={handleCheckAnswer}
                    disabled={!isSelectionComplete(selectedKeys, currentRequired)}
                    className="px-8 py-3 border border-slate-400 disabled:opacity-20 disabled:border-slate-800 text-white text-[10px] uppercase tracking-widest transition-colors hover:bg-white hover:text-black font-mono"
                  >
                    EXECUTE QUERY
                  </button>
                ) : isLastQuestion ? (
                  <button
                    type="button"
                    onClick={handleFinishSession}
                    className="px-8 py-3 border border-emerald-500 bg-emerald-950/40 text-emerald-200 text-[10px] uppercase tracking-widest transition-colors hover:bg-emerald-400 hover:text-black hover:border-emerald-400 font-mono flex items-center gap-2"
                  >
                    SUBMIT SIMULATION →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setCurrentIndex((prev) => Math.min(activeQuestions.length - 1, prev + 1))
                    }
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
                    const isAns = !!answers[q.id]?.length;
                    const isFlag = !!flagged[q.id];

                    let cellClass = "bg-[#06080a] text-slate-500 hover:bg-slate-900/50";
                    if (isCurrent)
                      cellClass = "bg-slate-800 text-white font-bold inset-ring-1 inset-ring-white";
                    else if (isAns) cellClass = "bg-slate-900/80 text-slate-300";
                    else if (isFlag) cellClass = "bg-slate-200 text-black font-bold";

                    return (
                      <button
                        type="button"
                        key={q.id}
                        onClick={() => setCurrentIndex(idx)}
                        className={`h-12 flex items-center justify-center text-[10px] font-mono transition-all ${cellClass}`}
                      >
                        {String(idx + 1).padStart(2, "0")}
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

  // ── 3. Results Stage ──
  // Only numbers this session actually produced. This screen used to also show a hard-coded
  // "topic breakdown" (Elasticity & Hooke's Law 2/2, Bending Moments & Shear Force 1/2) left over
  // from placeholder civil-engineering data — identical after every session, for every exam.
  const { correct, attempted, total } = calculateScore();
  const accuracyPct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const skipped = total - attempted;
  const examName = realExamData?.name || "this exam";

  const restart = () => {
    setAnswers({});
    setSubmitted({});
    setFlagged({});
    setCurrentIndex(0);
    setTimerSeconds(0);
    setPracticeSessionId(null);
    setStage("active");
  };

  const stats = [
    {
      label: "Score",
      value: `${correct}`,
      suffix: `/${total}`,
      note: notScored > 0 ? `correct answers · ${notScored} not scored` : "correct answers",
    },
    {
      label: "Accuracy",
      value: `${accuracyPct}`,
      suffix: "%",
      note: attempted > 0 ? "of the questions you answered" : "no questions answered",
    },
    {
      label: "Answered",
      value: `${attempted}`,
      suffix: `/${total}`,
      note: skipped > 0 ? `${skipped} skipped` : "none skipped",
    },
    { label: "Time", value: formatTime(timerSeconds), suffix: "", note: "minutes : seconds" },
  ];

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      <main className="max-w-[1200px] mx-auto px-6 pt-16">
        <div className="mb-16 border-b border-slate-900 pb-8">
          <div className="font-mono text-xs tracking-[0.2em] text-slate-500 uppercase mb-3">
            Session complete
          </div>
          <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight">{examName}</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-900 border-t border-b border-slate-900 mb-16">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-[#06080a] p-8 md:p-10 text-center flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-4">
                {stat.label}
              </span>
              <span className="text-5xl md:text-6xl font-light text-white tracking-tighter mb-2">
                {stat.value}
                {stat.suffix && <span className="text-2xl text-slate-600">{stat.suffix}</span>}
              </span>
              <span className="font-mono text-[10px] text-slate-600 uppercase tracking-widest">
                {stat.note}
              </span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={restart}
            className="p-6 text-left border border-slate-700 hover:border-white transition-colors group flex items-center justify-between"
          >
            <span className="text-lg font-light text-slate-300 group-hover:text-white transition-colors">
              Practice again
            </span>
            <span className="font-mono text-xs text-slate-600 group-hover:text-white">→</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("learn");
              restart();
            }}
            className="p-6 text-left border border-slate-700 hover:border-white transition-colors group flex items-center justify-between"
          >
            <span className="text-lg font-light text-slate-300 group-hover:text-white transition-colors">
              Review in Learn mode
            </span>
            <span className="font-mono text-xs text-slate-600 group-hover:text-white">→</span>
          </button>
          {examSlug && (
            <Link
              to="/exams/$examSlug"
              params={{ examSlug }}
              className="p-6 text-left border border-slate-700 hover:border-white transition-colors group flex items-center justify-between"
            >
              <span className="text-lg font-light text-slate-300 group-hover:text-white transition-colors">
                Back to exam
              </span>
              <span className="font-mono text-xs text-slate-600 group-hover:text-white">→</span>
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}

// Placeholder for a practice session while its questions load, laid out like the mode being
// opened: Learn shows a feed of question cards, Simulation one question with its options. Both
// keep the top bar and the question-navigator sidebar.
function PracticeSessionSkeleton({ mode }: { mode: "simulation" | "learn" }) {
  const options = (
    <div className="space-y-3">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-4 border border-slate-900 p-4">
          <Skeleton className="w-8 h-8 shrink-0" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );

  return (
    <SkeletonRegion
      label="Loading practice session…"
      className="min-h-screen bg-[#06080a] flex flex-col"
    >
      <div className="px-6 py-4 border-b border-slate-900 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64 max-w-[40vw] hidden sm:block" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-52" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      <div className="flex-1 w-full grid grid-cols-1 lg:grid-cols-4 border-t border-slate-900">
        <main className="lg:col-span-3 border-r border-slate-900 p-6 sm:p-12 md:p-16 space-y-12">
          {mode === "learn" ? (
            [1, 2].map((n) => (
              <div key={n} className="border border-slate-900 p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-40" />
                  <Skeleton className="h-6 w-28" />
                </div>
                <div className="space-y-3">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-4/5" />
                </div>
                {options}
              </div>
            ))
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-900 pb-4">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-11/12" />
                <Skeleton className="h-8 w-3/5" />
              </div>
              {options}
            </>
          )}
        </main>

        <aside className="p-8 space-y-6 hidden lg:block">
          <Skeleton className="h-3 w-32" />
          <div className="grid grid-cols-5 gap-2">
            {placeholderKeys(15, "cell").map((key) => (
              <Skeleton key={key} className="aspect-square" />
            ))}
          </div>
        </aside>
      </div>
    </SkeletonRegion>
  );
}

function isNumerical(q: Question): boolean {
  return q.questionType === "numerical";
}

// Right or wrong, for an option selection or — for a numerical question — the typed answer, held
// as a selection of one. Graded on the client like options (see the item 25 note above); the
// server grades the same way when the attempt is recorded.
function isAnswerCorrect(q: Question, answer: string[] | undefined): boolean {
  if (isNumerical(q)) {
    return (
      !!answer?.[0] &&
      gradeNumericAnswer(answer[0], {
        ranges: q.numericRanges ?? [],
        display: q.numericAnswer ?? null,
      })
    );
  }
  return isSelectionCorrect(answer, correctKeysOf(q));
}

// "4.24 to 4.26", or every range of an answer with more than one.
function acceptedNumeric(q: Question): string {
  return q.numericRanges?.length
    ? q.numericRanges.map(formatNumericRange).join(" or ")
    : (q.numericAnswer ?? "");
}

function NumericAnswerField({
  id,
  value,
  onChange,
  onCheck,
  checked,
  correct,
  accepted = null,
  showCheckButton = true,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onCheck: () => void;
  checked: boolean;
  correct: boolean;
  /** Shown after checking, when the page doesn't show it elsewhere. */
  accepted?: string | null;
  /** Off where the page has its own check control; Enter still checks. */
  showCheckButton?: boolean;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-3"
      >
        Your answer
      </label>
      <div className="flex flex-wrap items-center gap-4">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCheck()}
          disabled={checked}
          placeholder="e.g. 4.25 or 4,25"
          className="w-64 max-w-full bg-transparent border-b border-slate-700 focus:border-white outline-none text-xl text-white py-2 placeholder:text-slate-700 disabled:text-slate-400"
        />
        {!checked ? (
          showCheckButton && (
            <button
              type="button"
              onClick={onCheck}
              disabled={!value.trim()}
              className="px-4 py-2 border border-slate-600 disabled:opacity-30 text-[10px] font-mono uppercase tracking-widest text-slate-300 hover:text-white hover:border-white transition-colors"
            >
              Check answer
            </button>
          )
        ) : (
          <span
            className={`font-mono text-[10px] uppercase tracking-widest ${correct ? "text-emerald-400" : "text-rose-400"}`}
          >
            {correct ? "✓ Correct" : "✕ Incorrect"}
            {accepted ? ` · Accepted: ${accepted}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// Every correct option of a question (older payloads only had correctKey).
function correctKeysOf(q: Question): string[] {
  return q.correctKeys?.length ? q.correctKeys : q.correctKey ? [q.correctKey] : [];
}

// "Select 3 answers · 1 of 3 selected" — only for questions with more than one correct option.
function SelectionHint({
  required,
  selected,
  className = "",
}: {
  required: number;
  selected: number;
  className?: string;
}) {
  if (required <= 1) return null;
  return (
    <p
      className={`font-mono text-[11px] uppercase tracking-widest ${
        selected === required ? "text-sky-300" : "text-slate-400"
      } ${className}`}
      aria-live="polite"
    >
      Select {required} answers · {selected} of {required} selected
    </p>
  );
}
