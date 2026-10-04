import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Lock,
  Sparkles,
  Trash2,
} from "lucide-react";
import React, { useState } from "react";
import { extractLabeledSection, mergeReadingResources } from "../../../lib/additional-reading";
import { orpc } from "../../../lib/orpc";
import { type QuestionImage, QuestionImages } from "../../components/question/QuestionImages";
import {
  type DuplicateChoice,
  DuplicateDecisions,
} from "../../components/review/DuplicateDecisions";
import { placeholderKeys } from "../../components/ui/Skeleton";

interface ReviewResultLike {
  status: "approved" | "needs_decisions" | "not_approved" | "rejected";
  message: string;
  pendingDecisions: number;
  failed: { number: number; preview: string; reason: string }[];
}

function toneFor(result: ReviewResultLike): "success" | "attention" | "error" {
  if (result.status === "not_approved") return "error";
  if (result.status === "needs_decisions") return "attention";
  return "success";
}

/** The server's summary plus, for failures, one readable line per question. */
function describeForPage(result: ReviewResultLike): string {
  const lines = result.failed.map((f) => `  Q${f.number} “${f.preview}” — ${f.reason}`);
  return [result.message, ...lines].join("\n");
}

interface QuestionElement {
  questionText?: string;
  rawText?: string;
  question?: string;
  prompt?: string;
  options?: string[];
  choices?: string[];
  answer?: string;
  correctAnswer?: string;
  explanation?: string;
  rationale?: string;
  exam?: string;
  subject?: string;
  images?: Array<{
    placement: "question" | "option" | "explanation";
    optionIndex?: number | null;
    storageKey: string;
    alt?: string;
  }>;
  additionalReading?: string | string[];
  additionalReadings?: string[];
  additionalReadingLinks?: Array<{ text: string; url?: string }>;
}

const ADDITIONAL_READING_STOP_LABELS = [
  "Objective",
  "What This Item Tests",
  "Rationale",
  "Additional Reading Resources",
];

function parseAdditionalReadingText(content: string) {
  const readText = extractLabeledSection(
    content,
    "Additional Reading",
    ADDITIONAL_READING_STOP_LABELS,
  );
  if (!readText) return [];
  return readText.split(/\n+/).filter((line) => line.trim().length > 0);
}

function mergeAdditionalReadings(q: QuestionElement, fullContent: string) {
  return mergeReadingResources({
    extractedTitles: parseAdditionalReadingText(fullContent),
    rawReadings: q.additionalReadings || q.additionalReading,
    readingLinks: q.additionalReadingLinks,
  });
}

function parseQuestionElement(q: QuestionElement, index: number) {
  const rawText = q.questionText || q.question || q.rawText || q.prompt || `Question ${index + 1}`;
  let options: string[] = [];
  if (Array.isArray(q.options) && q.options.length > 0) options = q.options;
  else if (Array.isArray(q.choices) && q.choices.length > 0) options = q.choices;
  // No placeholder options: a reviewer has to see that none were extracted.

  // 1. Strip Question X of Y: prefix
  let cleanText = rawText.replace(/^Question\s+\d+(\s+of\s+\d+)?:?\s*/i, "").trim();

  // 2. Extract Rationale, Objective, and Additional Reading metadata
  const explanationParts: string[] = [];
  const existingExplanation = q.explanation || q.rationale || "";
  const fullContent = `${rawText}\n${existingExplanation}`;

  const rationaleMatch = fullContent.match(
    /Rationale:\s*([\s\S]*?)(?=\n\s*(?:Objective:|What This Item Tests:|Additional Reading:)|$)/i,
  );
  if (rationaleMatch?.[1]) {
    explanationParts.push(`Rationale:\n${rationaleMatch[1].trim()}`);
  } else if (existingExplanation && !existingExplanation.includes("Extracted directly")) {
    explanationParts.push(existingExplanation);
  }

  const objMatch = fullContent.match(
    /Objective:\s*([\s\S]*?)(?=\n\s*(?:What This Item Tests:|Additional Reading:|Rationale:)|$)/i,
  );
  if (objMatch?.[1]) {
    explanationParts.push(`Objective:\n${objMatch[1].trim()}`);
  }

  // 3. Strip metadata sections from question body
  cleanText = cleanText
    .split(/\n\s*(?:Objective:|What This Item Tests:|Additional Reading:|Rationale:)/i)[0]
    .trim();

  // 4. Strip choice text if concatenated into question body
  options.forEach((opt) => {
    if (opt && opt.length > 3) {
      cleanText = cleanText.replace(opt, "").trim();
    }
  });

  // 5. Clean paragraph formatting
  const paragraphs = cleanText
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p && !/^Question\s+\d+/i.test(p) && !/^Select\s+all/i.test(p));

  const questionText = paragraphs.join("\n\n") || cleanText;
  // Missing explanation/answer stay missing (the batch's quality warnings call them out) rather
  // than showing a placeholder explanation or the first option as "correct".
  const explanation = explanationParts.join("\n\n");
  const answer = q.answer || q.correctAnswer || "";
  const images: QuestionImage[] = (q.images ?? []).map((image) => ({
    url: `/api/media/${image.storageKey}`,
    placement: image.placement,
    optionKey:
      image.placement === "option" && image.optionIndex != null
        ? String.fromCharCode(65 + image.optionIndex)
        : null,
    alt: image.alt || null,
  }));
  const exam = q.exam || "Practice Assessment";
  const subject = q.subject || "General Subject";
  const additionalReadings = mergeAdditionalReadings(q, fullContent);

  return { questionText, options, answer, explanation, exam, subject, additionalReadings, images };
}

export const Route = createFileRoute("/admin/review")({
  head: () => ({ meta: [{ title: "Data Cleaning & Verification — Admin — Prepora" }] }),
  component: AdminReviewPage,
});

function AdminReviewPage() {
  const {
    data: queue,
    isError: isQueueError,
    error: queueError,
    refetch: refetchQueue,
  } = useQuery(orpc.admin.getReviewQueue.queryOptions());
  // On the deployed site approving is locked — it publishes through the local-only pipeline
  // service (packages/api/src/lib/local-only-services.ts). Rejecting still works everywhere.
  const { data: localOnlyStatus } = useQuery(orpc.admin.getLocalOnlyStatus.queryOptions());
  const publishingLockedReason = localOnlyStatus?.publishingLockedReason ?? null;
  // Until the queue has arrived the page shows skeletons — not "0 batches" and "queue is
  // completely clear", which is what an empty `items` used to render while it loaded. Set in the
  // same effect that copies the queue into `items`, so there's no render in between where the
  // data has arrived but `items` is still empty.
  const [hasLoadedQueue, setHasLoadedQueue] = useState(false);
  const isQueueLoading = !hasLoadedQueue && !isQueueError;
  const { mutateAsync: processReviewItem } = useMutation(
    orpc.admin.processReviewItem.mutationOptions(),
  );
  const { mutateAsync: processReviewBatch } = useMutation(
    orpc.admin.processReviewBatch.mutationOptions(),
  );

  const [items, setItems] = React.useState<any[]>(queue || []);
  const [isProcessing, setIsProcessing] = useState(false);
  // Which item's button started the current request, so only that one shows a spinner — and the
  // outcome of the last action, since publishing a large batch takes a while and used to finish
  // silently (or fail silently per question).
  const [activeAction, setActiveAction] = useState<{
    id: string;
    action: "approve" | "discard";
  } | null>(null);
  // "attention" = needs a decision (possible duplicates), not an error.
  const [lastResult, setLastResult] = useState<{
    tone: "success" | "attention" | "error";
    message: string;
  } | null>(null);

  // What approving did, for one batch: remove its card once it's done; otherwise keep it (with its
  // open decisions) and say what's left.
  const applyReviewResult = (id: string, result: ReviewResultLike) => {
    if (result.status === "approved" || result.status === "rejected") {
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, pendingDecisions: result.pendingDecisions } : i)),
      );
    }
  };

  React.useEffect(() => {
    if (queue) {
      setItems(queue);
      setHasLoadedQueue(true);
    }
  }, [queue]);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  // A batch waiting only on possible duplicates starts collapsed — its other questions are already
  // published; the duplicates are what need attention.
  const isItemExpanded = (item: { id: string; pendingDecisions?: number }) =>
    expandedItems[item.id] ?? !((item.pendingDecisions ?? 0) > 0);
  const toggleExpand = (item: { id: string; pendingDecisions?: number }) => {
    const current = isItemExpanded(item);
    setExpandedItems((prev) => ({ ...prev, [item.id]: !current }));
  };

  // The admin's choices for each batch's possible duplicates, applied by Approve & Publish.
  const queryClient = useQueryClient();
  const [dupChoices, setDupChoices] = useState<Record<string, Record<string, DuplicateChoice>>>({});
  const chosenCount = (batchId: string) => Object.keys(dupChoices[batchId] ?? {}).length;
  const { mutateAsync: approveWithChoices } = useMutation(
    orpc.admin.approveWithDuplicateChoices.mutationOptions(),
  );
  // Approve one batch, applying any duplicate choices made for it first.
  const approveBatch = async (id: string): Promise<ReviewResultLike> => {
    const choices = Object.entries(dupChoices[id] ?? {}).map(([decisionId, choice]) => ({
      id: decisionId,
      choice,
    }));
    if (choices.length === 0) return processReviewItem({ id, action: "approve" });
    const result = await approveWithChoices({ batchId: id, choices });
    setDupChoices((prev) => {
      const { [id]: _done, ...rest } = prev;
      return rest;
    });
    await queryClient.invalidateQueries({
      queryKey: orpc.admin.listDuplicateReviews.queryOptions({ input: { batchId: id } }).queryKey,
    });
    return {
      ...result,
      message:
        result.choiceErrors.length > 0
          ? `${result.message}\n${result.choiceErrors.map((e) => `  ${e}`).join("\n")}`
          : result.message,
    };
  };

  const handleAction = async (id: string, action: "approve" | "discard") => {
    try {
      setIsProcessing(true);
      setActiveAction({ id, action });
      setLastResult(null);
      const result =
        action === "discard"
          ? await processReviewItem({ id, action: "reject" })
          : await approveBatch(id);
      applyReviewResult(id, result);
      setLastResult({ tone: toneFor(result), message: describeForPage(result) });
    } catch (err) {
      setLastResult({
        tone: "error",
        message: `Couldn't process this batch: ${(err instanceof Error ? err.message : undefined) ?? "check the server logs"}`,
      });
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  // docs/roadmap/engineering-roadmap.md item 21 moved both batch actions to a single
  // processReviewBatch request. Discard still uses it (it's instant); approve doesn't:
  // it approves batches from the page, a few at a time, instead of one processReviewBatch request:
  // a request that only returns when every batch is published gave no progress at all (it looked
  // frozen for minutes). Each batch is one processReviewItem call, so the button can count them
  // off and each card disappears as its batch is published.
  const BATCH_APPROVE_CONCURRENCY = 3;
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const handleBatchApprove = async () => {
    // Batches with known extraction problems need a human look.
    // Batches still waiting on possible duplicates are included only once the admin has chosen for
    // at least one of them — approving then applies those choices.
    const safeItems = items.filter(
      (i) => !(i.qualityIssues?.length > 0) && (!(i.pendingDecisions > 0) || chosenCount(i.id) > 0),
    );
    if (safeItems.length === 0) {
      alert(
        "No batches ready to approve: fix extraction problems, or choose what to keep for possible duplicates first.",
      );
      return;
    }
    if (
      !confirm(
        `Approve and publish ${safeItems.length} batch${safeItems.length === 1 ? "" : "es"}? Choices you made for possible duplicates are applied; any without a choice stay for review.`,
      )
    ) {
      return;
    }
    setIsProcessing(true);
    setLastResult(null);
    setBatchProgress({ done: 0, total: safeItems.length });
    const failures: string[] = [];
    const needsDecisions: string[] = [];
    let published = 0;
    let openDecisions = 0;
    let next = 0;
    const worker = async () => {
      while (next < safeItems.length) {
        const item = safeItems[next++];
        try {
          const result = await approveBatch(item.id);
          applyReviewResult(item.id, result);
          if (result.status === "approved") {
            published++;
          } else if (result.status === "needs_decisions") {
            openDecisions += result.pendingDecisions;
            needsDecisions.push(`Batch ${item.id.slice(0, 8)}: ${result.message}`);
          } else {
            failures.push(`Batch ${item.id.slice(0, 8)}: ${describeForPage(result)}`);
          }
        } catch (err) {
          failures.push(
            `Batch ${item.id.slice(0, 8)}: ${(err instanceof Error ? err.message : undefined) ?? "failed"}`,
          );
        } finally {
          setBatchProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(BATCH_APPROVE_CONCURRENCY, safeItems.length) }, worker),
      );
    } finally {
      setIsProcessing(false);
      setBatchProgress(null);
      const headline = [
        `Published ${published} of ${safeItems.length} batches`,
        needsDecisions.length > 0
          ? `${needsDecisions.length} ${needsDecisions.length === 1 ? "batch has" : "batches have"} ${openDecisions} possible duplicate${openDecisions === 1 ? "" : "s"} to review below`
          : null,
        failures.length > 0 ? `${failures.length} couldn't be published` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      setLastResult({
        tone: failures.length > 0 ? "error" : needsDecisions.length > 0 ? "attention" : "success",
        message: [`${headline}.`, ...needsDecisions, ...failures].join("\n"),
      });
    }
  };

  const handleBatchDelete = async () => {
    if (items.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to discard ALL ${items.length} scraped batches in the queue? This cannot be undone.`,
      )
    ) {
      return;
    }
    setIsProcessing(true);
    try {
      const { results } = await processReviewBatch({
        ids: items.map((item) => item.id),
        action: "reject",
      });
      const succeededIds = new Set(results.filter((r) => r.success).map((r) => r.id));
      setItems((prev) => prev.filter((i) => !succeededIds.has(i.id)));
    } catch (_err) {
      alert("Error processing batch discard");
    } finally {
      setIsProcessing(false);
    }
  };

  const totalQuestions = items.reduce((acc, item) => {
    const elems = (item.parsedData as any)?.extractedElements || [];
    return acc + (elems.length || 0);
  }, 0);

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white p-6 md:p-10 space-y-8 pb-32">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-slate-800 gap-4">
        <div className="flex items-center gap-4">
          <Link
            to="/admin"
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Data Cleaning & Verification Queue
              </h1>
              {isQueueLoading ? (
                <span
                  aria-hidden="true"
                  className="h-5 w-44 rounded-full bg-slate-800/80 animate-pulse"
                />
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-blue-950 text-blue-400 border border-blue-800">
                  {items.length} Batches ({totalQuestions} Total Questions)
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Verify extracted prompts, choices, correct answers & explanations before publishing to
              production.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBatchDelete}
            disabled={isQueueLoading || isProcessing || items.length === 0}
            className="px-5 py-3 bg-rose-950/60 hover:bg-rose-900 border border-rose-900/80 disabled:opacity-50 text-rose-300 font-mono text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-900/30 flex items-center gap-2 shrink-0"
          >
            <Trash2 className="w-4 h-4" /> Batch Discard All
          </button>

          <button
            type="button"
            onClick={handleBatchApprove}
            disabled={
              isQueueLoading || isProcessing || items.length === 0 || !!publishingLockedReason
            }
            title={publishingLockedReason ?? undefined}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 shrink-0"
          >
            {batchProgress ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Publishing{" "}
                {Math.min(batchProgress.done + 1, batchProgress.total)} of {batchProgress.total}{" "}
                batches…
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" /> Batch Approve Safe Items
              </>
            )}
          </button>
        </div>
      </div>

      {publishingLockedReason && (
        <div
          role="status"
          className="mb-6 flex items-start gap-3 rounded-xl border border-amber-900/60 bg-amber-950/30 p-4 font-mono text-xs text-amber-200"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div className="space-y-1 leading-relaxed">
            <p className="uppercase tracking-widest text-amber-300">
              Approving is locked on the deployed site
            </p>
            <p>{publishingLockedReason}</p>
          </div>
        </div>
      )}

      {lastResult && (
        <div
          className={`mb-6 p-4 rounded-xl border font-mono text-xs whitespace-pre-wrap break-words ${
            lastResult.tone === "success"
              ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
              : lastResult.tone === "attention"
                ? "border-amber-800 bg-amber-950/30 text-amber-200"
                : "border-rose-800 bg-rose-950/30 text-rose-200"
          }`}
        >
          {lastResult.message}
        </div>
      )}

      {/* Main Review Queue */}
      <div className="space-y-6">
        {isQueueLoading ? (
          <ReviewQueueSkeleton />
        ) : isQueueError ? (
          <div className="p-6 border border-rose-900/60 bg-rose-950/30 rounded-2xl font-mono text-xs text-rose-300 flex items-center justify-between gap-4">
            <span>Couldn't load the review queue: {queueError?.message ?? "unknown error"}</span>
            <button
              type="button"
              onClick={() => refetchQueue()}
              className="px-3 py-1.5 border border-rose-800 hover:bg-rose-900/60 uppercase tracking-wider shrink-0"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-mono text-sm border border-slate-800 rounded-2xl bg-slate-950/40 space-y-3">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-300 font-medium text-base">
              Verification queue is completely clear!
            </p>
            <p className="text-xs text-slate-500">
              Run a website scraping job from the Admin Pipeline to ingest more practice
              assessments.
            </p>
            <Link
              to="/admin/scraping"
              className="inline-block mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-mono uppercase tracking-wider border border-slate-700 rounded-lg transition-colors"
            >
              Open Scraper Pipeline →
            </Link>
          </div>
        ) : (
          items.map((item) => {
            const parsed = item.parsedData as any;
            const elements: QuestionElement[] = parsed?.extractedElements || [];
            const isExpanded = isItemExpanded(item);
            const waitingOnChoices = item.pendingDecisions > 0 && chosenCount(item.id) === 0;
            const metadata = parsed?.metadata || {};
            const examCode = String(metadata.exam || "").replace(/^Exam\s+/i, "");

            return (
              <div
                key={item.id}
                data-testid={`review-batch-${item.id}`}
                className={`border rounded-2xl overflow-hidden transition-all ${
                  item.pendingDecisions > 0
                    ? "border-amber-900/60 bg-amber-950/10"
                    : "border-slate-800 bg-slate-950/60"
                }`}
              >
                {/* Exam details, as scraped — what this batch will be published under */}
                {(metadata.examTitle || metadata.exam) && (
                  <div className="px-5 pt-5 flex items-start gap-4">
                    {metadata.logoUrl && (
                      <img
                        src={metadata.logoUrl}
                        alt=""
                        className="w-14 h-14 shrink-0 object-contain"
                        loading="lazy"
                      />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center flex-wrap gap-2">
                        <h2 className="text-lg text-white font-medium">
                          {metadata.examTitle || metadata.exam}
                        </h2>
                        {examCode && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            {examCode}
                          </span>
                        )}
                      </div>
                      {metadata.description && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-3">
                          {metadata.description}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Batch Card Header */}
                <div className="p-5 border-b border-slate-900 bg-slate-900/40 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center flex-wrap gap-3">
                    <span className="text-xs font-mono px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                      BATCH #{item.id.slice(0, 8)}
                    </span>

                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 max-w-md truncate"
                      title={item.sourceUrl}
                    >
                      <span className="truncate">{item.sourceUrl}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>

                    <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                      {elements.length} Questions Extracted
                    </span>

                    {/* What approving this batch will actually add — a re-scrape is mostly
                        questions the exam already has, which publishing skips. */}
                    {typeof item.newQuestionCount === "number" &&
                      (item.newQuestionCount > 0 ? (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800">
                          {item.newQuestionCount} new
                          {item.existingQuestionCount > 0
                            ? ` · ${item.existingQuestionCount} already in exam`
                            : ""}
                        </span>
                      ) : (
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-700">
                          Nothing new · all {item.existingQuestionCount} already in exam
                        </span>
                      ))}

                    {item.pendingDecisions > 0 && (
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {item.pendingDecisions} possible
                        duplicate{item.pendingDecisions === 1 ? "" : "s"} to review
                      </span>
                    )}

                    {item.qualityIssues?.length > 0 && (
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Extraction problems — re-scrape
                        recommended
                      </span>
                    )}
                  </div>

                  {item.qualityIssues?.length > 0 && (
                    <ul className="basis-full text-xs font-mono text-rose-300/90 space-y-1 list-disc pl-5">
                      {item.qualityIssues.map((issue: { code: string; message: string }) => (
                        <li key={issue.code}>{issue.message}</li>
                      ))}
                    </ul>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item)}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors text-xs font-mono flex items-center gap-1"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                      <span>{isExpanded ? "Collapse" : "Expand"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing || !!publishingLockedReason || waitingOnChoices}
                      title={
                        publishingLockedReason ??
                        (waitingOnChoices
                          ? "Choose what to keep for the possible duplicates below first."
                          : undefined)
                      }
                      onClick={() => handleAction(item.id, "approve")}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      {activeAction?.id === item.id && activeAction?.action === "approve" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Publishing{" "}
                          {elements.length} questions…
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-3.5 h-3.5" /> Approve & Publish
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => handleAction(item.id, "discard")}
                      className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-900/80 disabled:opacity-50 text-rose-300 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Discard
                    </button>
                  </div>
                </div>

                {item.pendingDecisions > 0 && (
                  <DuplicateDecisions
                    batchId={item.id}
                    disabledReason={publishingLockedReason}
                    choices={dupChoices[item.id] ?? {}}
                    onChoose={(decisionId, choice) =>
                      setDupChoices((prev) => ({
                        ...prev,
                        [item.id]: { ...prev[item.id], [decisionId]: choice },
                      }))
                    }
                  />
                )}

                {item.pendingDecisions > 0 && !isExpanded && (
                  <p className="px-6 py-3 font-mono text-[11px] text-slate-500">
                    The other {Math.max(elements.length - item.pendingDecisions, 0)} questions in
                    this batch are already published — expand to see them.
                  </p>
                )}

                {/* Expanded Extracted Questions View */}
                {isExpanded && (
                  <div className="p-6 space-y-6 divide-y divide-slate-900">
                    {elements.length === 0 ? (
                      <div className="text-center py-6 text-slate-500 font-mono text-xs">
                        No parsed questions in this batch.
                      </div>
                    ) : (
                      elements.map((rawQ, qIdx) => {
                        const q = parseQuestionElement(rawQ, qIdx);

                        return (
                          <div key={qIdx} className={`${qIdx > 0 ? "pt-6" : ""} space-y-4`}>
                            {/* Question Title & Tag */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold text-blue-400 uppercase tracking-wider">
                                    Question {qIdx + 1} of {elements.length}
                                  </span>
                                  <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">
                                    {q.exam}
                                  </span>
                                </div>
                                <h3 className="text-sm md:text-base font-medium text-slate-100 leading-relaxed font-sans whitespace-pre-line">
                                  {q.questionText}
                                </h3>
                                <QuestionImages
                                  images={q.images}
                                  placement="question"
                                  className="mt-3"
                                />
                              </div>
                            </div>

                            {q.options.length === 0 && (
                              <p className="text-xs font-mono text-rose-300">
                                No options were extracted for this question.
                              </p>
                            )}

                            {/* Options Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                              {q.options.map((optText, optIdx) => {
                                const optKey = String.fromCharCode(65 + optIdx);
                                // Exact match per " | "-joined correct answer, like approval does —
                                // substring matching highlighted "1" when the answer was "10".
                                const isCorrect = q.answer
                                  .split(" | ")
                                  .some(
                                    (a) =>
                                      a.trim().replace(/\s+/g, " ").toLowerCase() ===
                                      optText.trim().replace(/\s+/g, " ").toLowerCase(),
                                  );

                                return (
                                  <div
                                    key={optKey}
                                    className={`p-3 rounded-xl border text-xs font-mono transition-all flex items-start gap-3 ${
                                      isCorrect
                                        ? "border-emerald-500/80 bg-emerald-950/40 text-emerald-200 font-semibold shadow-sm"
                                        : "border-slate-800/80 bg-slate-900/50 text-slate-300"
                                    }`}
                                  >
                                    <span
                                      className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center shrink-0 font-bold ${
                                        isCorrect
                                          ? "bg-emerald-500 text-black"
                                          : "bg-slate-800 text-slate-400"
                                      }`}
                                    >
                                      {optKey}
                                    </span>
                                    <span className="flex-1 leading-snug">
                                      {optText}
                                      <QuestionImages
                                        images={q.images}
                                        placement="option"
                                        optionKey={optKey}
                                        className="mt-2"
                                      />
                                    </span>
                                    {isCorrect && (
                                      <span className="text-[10px] uppercase font-bold text-emerald-400 px-1.5 py-0.5 bg-emerald-900/60 rounded border border-emerald-700/60 shrink-0">
                                        Correct Answer
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Rationale / Explanation Box */}
                            {q.explanation && (
                              <div className="p-3.5 rounded-xl border border-sky-900/40 bg-sky-950/20 text-xs font-sans text-sky-200 flex items-start gap-3">
                                <BookOpen className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                <div className="space-y-1 flex-1">
                                  <span className="font-mono text-[10px] uppercase tracking-wider text-sky-400 font-bold block">
                                    Official Rationale / Explanation:
                                  </span>
                                  <p className="leading-relaxed text-slate-300 whitespace-pre-line">
                                    {q.explanation}
                                  </p>
                                  <QuestionImages images={q.images} placement="explanation" />
                                </div>
                              </div>
                            )}

                            {/* Additional Reading Resources Section */}
                            {q.additionalReadings && q.additionalReadings.length > 0 && (
                              <div className="p-3.5 rounded-xl border border-amber-900/40 bg-amber-950/20 text-xs font-sans text-amber-200 flex items-start gap-3">
                                <ExternalLink className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-2 flex-1">
                                  <span className="font-mono text-[10px] uppercase tracking-wider text-amber-400 font-bold block">
                                    Additional Reading Resources:
                                  </span>
                                  <ul className="space-y-1.5 list-disc list-inside text-amber-300">
                                    {q.additionalReadings.map((resource) => (
                                      <li
                                        key={resource.url || resource.text}
                                        className="flex items-start gap-2"
                                      >
                                        {resource.url ? (
                                          <a
                                            href={resource.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 hover:underline transition-colors flex items-center gap-1 break-words flex-1"
                                          >
                                            {resource.text}
                                            <ExternalLink className="w-2.5 h-2.5 shrink-0 inline" />
                                          </a>
                                        ) : (
                                          <span className="text-amber-200 break-words flex-1">
                                            {resource.text}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// Placeholder batch cards shown while the review queue loads, laid out like the real card
// (exam header, batch row with badges and actions, question blocks with a 2×2 option grid and an
// explanation) so the page doesn't jump when the data arrives.
function ReviewQueueSkeleton({ batches = 2, questionsPerBatch = 2 }) {
  const bar = "rounded bg-slate-800/80";
  return (
    <div aria-busy="true" className="space-y-6 animate-pulse">
      <span className="sr-only">Loading review queue…</span>
      {placeholderKeys(batches, "batch").map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="border border-slate-800 bg-slate-950/60 rounded-2xl overflow-hidden"
        >
          {/* exam header */}
          <div className="px-5 pt-5 flex items-start gap-4">
            <div className={`w-14 h-14 shrink-0 ${bar}`} />
            <div className="flex-1 space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <div className={`h-5 w-72 max-w-[60%] ${bar}`} />
                <div className={`h-4 w-14 ${bar}`} />
              </div>
              <div className={`h-3 w-full max-w-2xl ${bar}`} />
              <div className={`h-3 w-2/3 max-w-xl ${bar}`} />
            </div>
          </div>

          {/* batch row: id, source link, badges / actions */}
          <div className="p-5 border-b border-slate-900 bg-slate-900/40 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center flex-wrap gap-3">
              <div className={`h-6 w-28 ${bar}`} />
              <div className={`h-4 w-64 max-w-[40vw] ${bar}`} />
              <div className="h-5 w-40 rounded-full bg-slate-800/80" />
            </div>
            <div className="flex items-center gap-3">
              <div className={`h-8 w-24 rounded-lg ${bar}`} />
              <div className={`h-8 w-36 rounded-lg ${bar}`} />
              <div className={`h-8 w-24 rounded-lg ${bar}`} />
            </div>
          </div>

          {/* question blocks */}
          <div className="p-5 space-y-8">
            {placeholderKeys(questionsPerBatch, "question").map((key) => (
              <div key={key} className="space-y-4">
                <div className="flex gap-2">
                  <div className={`h-4 w-20 ${bar}`} />
                  <div className={`h-4 w-24 ${bar}`} />
                </div>
                <div className="space-y-2">
                  <div className={`h-4 w-full ${bar}`} />
                  <div className={`h-4 w-11/12 ${bar}`} />
                  <div className={`h-4 w-3/5 ${bar}`} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {placeholderKeys(4, "option").map((key) => (
                    <div
                      key={key}
                      className="h-11 rounded-xl border border-slate-800/80 bg-slate-900/50"
                    />
                  ))}
                </div>
                <div className="h-20 rounded-xl border border-sky-900/30 bg-sky-950/10" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
