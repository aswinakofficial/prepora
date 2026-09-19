import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { orpc } from "../../../lib/orpc";
import { 
  ArrowLeft, 
  CheckCircle, 
  Trash2, 
  Edit2, 
  AlertCircle, 
  ExternalLink,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  CheckCircle2,
  BookOpen,
  Sparkles
} from "lucide-react";

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

function extractSection(content: string, label: string, stopLabels: string[]) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedStops = stopLabels.map((stop) => stop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const regex = new RegExp(`${escapedLabel}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:${escapedStops}):|$)`, "i");
  const match = content.match(regex);
  return match?.[1]?.trim() || "";
}

function parseAdditionalReadingText(content: string) {
  const readText = extractSection(content, "Additional Reading", [
    "Objective",
    "What This Item Tests",
    "Rationale",
    "Additional Reading Resources",
  ]);

  if (!readText) return [];

  return readText
    .split(/\n+/)
    .map(normalizeReadingTitle)
    .filter((line) => line.length > 0);
}

function mergeAdditionalReadings(q: QuestionElement, fullContent: string): AdditionalReadingResource[] {
  const resources = new Map<string, AdditionalReadingResource>();

  const addResource = (text?: string, url?: string) => {
    const title = normalizeReadingTitle(text || "");
    if (!title) return;

    const key = title.toLowerCase();
    const existing = resources.get(key);
    resources.set(key, {
      text: existing?.text || title,
      url: url || existing?.url,
    });
  };

  parseAdditionalReadingText(fullContent).forEach((title) => addResource(title));

  const rawAdditionalReadings = q.additionalReadings || q.additionalReading;
  if (Array.isArray(rawAdditionalReadings)) {
    rawAdditionalReadings.forEach((title) => addResource(title));
  } else if (typeof rawAdditionalReadings === "string") {
    rawAdditionalReadings.split(/\n+/).forEach((title) => addResource(title));
  }

  (q.additionalReadingLinks || []).forEach((link) => addResource(link.text, link.url));

  return Array.from(resources.values());
}

function parseQuestionElement(q: QuestionElement, index: number) {
  let rawText = q.questionText || q.question || q.rawText || q.prompt || `Question ${index + 1}`;
  let options: string[] = [];
  if (Array.isArray(q.options) && q.options.length > 0) options = q.options;
  else if (Array.isArray(q.choices) && q.choices.length > 0) options = q.choices;
  else options = ["Option A", "Option B", "Option C", "Option D"];

  // 1. Strip Question X of Y: prefix
  let cleanText = rawText.replace(/^Question\s+\d+(\s+of\s+\d+)?:?\s*/i, "").trim();

  // 2. Extract Rationale, Objective, and Additional Reading metadata
  const explanationParts: string[] = [];
  const existingExplanation = q.explanation || q.rationale || "";
  const fullContent = `${rawText}\n${existingExplanation}`;

  const rationaleMatch = fullContent.match(/Rationale:\s*([\s\S]*?)(?=\n\s*(?:Objective:|What This Item Tests:|Additional Reading:)|$)/i);
  if (rationaleMatch && rationaleMatch[1]) {
    explanationParts.push(`Rationale:\n${rationaleMatch[1].trim()}`);
  } else if (existingExplanation && !existingExplanation.includes("Extracted directly")) {
    explanationParts.push(existingExplanation);
  }

  const objMatch = fullContent.match(/Objective:\s*([\s\S]*?)(?=\n\s*(?:What This Item Tests:|Additional Reading:|Rationale:)|$)/i);
  if (objMatch && objMatch[1]) {
    explanationParts.push(`Objective:\n${objMatch[1].trim()}`);
  }

  // 3. Strip metadata sections from question body
  cleanText = cleanText.split(/\n\s*(?:Objective:|What This Item Tests:|Additional Reading:|Rationale:)/i)[0].trim();

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
  const explanation = explanationParts.join("\n\n") || "Extracted directly from Microsoft Learn Practice Assessment.";
  const answer = q.answer || q.correctAnswer || options[0] || "";
  const exam = q.exam || "Practice Assessment";
  const subject = q.subject || "General Subject";
  const additionalReadings = mergeAdditionalReadings(q, fullContent);

  return { questionText, options, answer, explanation, exam, subject, additionalReadings };
}

export const Route = createFileRoute("/admin/review")({
  head: () => ({ meta: [{ title: "Data Cleaning & Verification — Admin — Prepora" }] }),
  component: AdminReviewPage,
});

function AdminReviewPage() {
  const { data: queue, isLoading } = useQuery(orpc.admin.getReviewQueue.queryOptions());
  const { mutateAsync: processReviewItem } = useMutation(orpc.admin.processReviewItem.mutationOptions());
  
  const [items, setItems] = React.useState<any[]>(queue || []);
  const [isProcessing, setIsProcessing] = useState(false);

  React.useEffect(() => {
    if (queue) setItems(queue);
  }, [queue]);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = async (id: string, action: "approve" | "discard") => {
    try {
      setIsProcessing(true);
      await processReviewItem({ id, action: action === "discard" ? "reject" : "approve" });
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      alert("Error processing item in queue");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchApprove = async () => {
    const safeItems = items.filter(i => !i.hasCollision);
    if (safeItems.length === 0) {
      alert("No collision-free items available to approve.");
      return;
    }
    if (confirm(`Approve and publish all ${safeItems.length} collision-free scraped batches to live database?`)) {
      setIsProcessing(true);
      for (const item of safeItems) {
        await handleAction(item.id, "approve");
      }
      setIsProcessing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (items.length === 0) return;
    if (confirm(`Are you sure you want to discard ALL ${items.length} scraped batches in the queue? This cannot be undone.`)) {
      setIsProcessing(true);
      for (const item of [...items]) {
        await handleAction(item.id, "discard");
      }
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
          <Link to="/admin" className="p-2.5 rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                Data Cleaning & Verification Queue
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-blue-950 text-blue-400 border border-blue-800">
                {items.length} Batches ({totalQuestions} Total Questions)
              </span>
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Verify extracted prompts, choices, correct answers & explanations before publishing to production.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={handleBatchDelete}
            disabled={isProcessing || items.length === 0}
            className="px-5 py-3 bg-rose-950/60 hover:bg-rose-900 border border-rose-900/80 disabled:opacity-50 text-rose-300 font-mono text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-rose-900/30 flex items-center gap-2 shrink-0"
          >
            <Trash2 className="w-4 h-4" /> Batch Discard All
          </button>
          
          <button 
            onClick={handleBatchApprove}
            disabled={isProcessing || items.length === 0}
            className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-mono text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-900/30 flex items-center gap-2 shrink-0"
          >
            <CheckCircle className="w-4 h-4" /> Batch Approve Safe Items
          </button>
        </div>
      </div>

      {/* Main Review Queue */}
      <div className="space-y-6">
        {items.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-mono text-sm border border-slate-800 rounded-2xl bg-slate-950/40 space-y-3">
            <Sparkles className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-slate-300 font-medium text-base">Verification queue is completely clear!</p>
            <p className="text-xs text-slate-500">Run a website scraping job from the Admin Pipeline to ingest more practice assessments.</p>
            <Link to="/admin/scraping" className="inline-block mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-mono uppercase tracking-wider border border-slate-700 rounded-lg transition-colors">
              Open Scraper Pipeline →
            </Link>
          </div>
        ) : (
          items.map(item => {
            const parsed = item.parsedData as any;
            const elements: QuestionElement[] = parsed?.extractedElements || [];
            const isExpanded = expandedItems[item.id] !== false; // expanded by default
            const metadata = parsed?.metadata || {};
            
            return (
              <div 
                key={item.id} 
                className={`border rounded-2xl overflow-hidden transition-all ${
                  item.hasCollision 
                    ? "border-amber-900/60 bg-amber-950/10" 
                    : "border-slate-800 bg-slate-950/60"
                }`}
              >
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

                    {item.hasCollision && (
                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Similar Question Exists
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => toggleExpand(item.id)}
                      className="p-1.5 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white transition-colors text-xs font-mono flex items-center gap-1"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span>{isExpanded ? "Collapse" : "Expand"}</span>
                    </button>

                    <button 
                      disabled={isProcessing} 
                      onClick={() => handleAction(item.id, "approve")} 
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-mono font-bold transition-all shadow-md flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve & Publish
                    </button>

                    <button 
                      disabled={isProcessing} 
                      onClick={() => handleAction(item.id, "discard")} 
                      className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900 border border-rose-900/80 disabled:opacity-50 text-rose-300 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Discard
                    </button>
                  </div>
                </div>

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
                              </div>
                            </div>

                            {/* Options Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                              {q.options.map((optText, optIdx) => {
                                const optKey = String.fromCharCode(65 + optIdx);
                                const isCorrect = q.answer && (optText === q.answer || optText.includes(q.answer) || q.answer.includes(optText));

                                return (
                                  <div 
                                    key={optIdx}
                                    className={`p-3 rounded-xl border text-xs font-mono transition-all flex items-start gap-3 ${
                                      isCorrect 
                                        ? "border-emerald-500/80 bg-emerald-950/40 text-emerald-200 font-semibold shadow-sm" 
                                        : "border-slate-800/80 bg-slate-900/50 text-slate-300"
                                    }`}
                                  >
                                    <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center shrink-0 font-bold ${
                                      isCorrect ? "bg-emerald-500 text-black" : "bg-slate-800 text-slate-400"
                                    }`}>
                                      {optKey}
                                    </span>
                                    <span className="flex-1 leading-snug">{optText}</span>
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
                                  <p className="leading-relaxed text-slate-300 whitespace-pre-line">{q.explanation}</p>
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
                                    {q.additionalReadings.map((resource, linkIdx) => (
                                      <li key={linkIdx} className="flex items-start gap-2">
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
