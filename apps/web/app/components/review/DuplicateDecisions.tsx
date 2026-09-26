import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Copy, GitCompare, Loader2, SkipForward, Sparkles } from "lucide-react";
import { useState } from "react";
import { orpc } from "../../../lib/orpc";
import { type DiffToken, diffWords } from "../../../lib/word-diff";

// Possible duplicates held while approving a batch (packages/api's listDuplicateReviews): each new
// question side by side with the published question it resembles, so an admin can decide whether
// it's the same question reworded or a different question. The suggested choice is pre-selected
// (same options + same answer + no changed number → "same"); nothing merges without a click.

type Decision = "same" | "different" | "skip";

interface BatchResult {
  status: "approved" | "needs_decisions" | "not_approved" | "rejected";
  message: string;
}

function Diffed({ tokens, tone }: { tokens: DiffToken[]; tone: "removed" | "added" }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.kind === "same" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional, never reordered
          <span key={i}>{t.text}</span>
        ) : (
          <mark
            // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional, never reordered
            key={i}
            className={
              tone === "removed"
                ? "rounded bg-rose-500/25 px-0.5 text-rose-200 line-through decoration-rose-400/70"
                : "rounded bg-emerald-500/25 px-0.5 text-emerald-100"
            }
          >
            {t.text}
          </mark>
        ),
      )}
    </>
  );
}

function OptionList({ options }: { options: { key: string; text: string; correct: boolean }[] }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {options.map((o) => (
        <li
          key={o.key}
          className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
            o.correct
              ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-200"
              : "border-slate-800 bg-slate-900/50 text-slate-300"
          }`}
        >
          <span className="font-mono font-bold">{o.key}</span>
          <span className="flex-1">{o.text}</span>
          {o.correct && <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />}
        </li>
      ))}
    </ul>
  );
}

const DECISION_LABEL: Record<Decision, string> = {
  same: "Same question",
  different: "Different question",
  skip: "Skip",
};

const STATUS_LABEL = {
  same: "Linked to the existing question",
  different: "Published as a new question",
  skipped: "Skipped — not published",
} as const;

export function DuplicateDecisions({
  batchId,
  disabledReason,
  onBatchResult,
}: {
  batchId: string;
  /** Why decisions can't be made here (e.g. publishing is locked on the deployed site). */
  disabledReason?: string | null;
  /** Called when a decision finished the batch, or with any other outcome worth announcing. */
  onBatchResult: (result: BatchResult) => void;
}) {
  const queryClient = useQueryClient();
  const listQuery = orpc.admin.listDuplicateReviews.queryOptions({ input: { batchId } });
  const { data: decisions = [], isPending } = useQuery(listQuery);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: listQuery.queryKey });
  const { mutateAsync: resolve } = useMutation(orpc.admin.resolveDuplicateReview.mutationOptions());
  const { mutateAsync: acceptAll } = useMutation(
    orpc.admin.acceptSuggestedDecisions.mutationOptions(),
  );

  const decide = async (id: string, decision: Decision) => {
    setBusy(id);
    setError(null);
    try {
      const outcome = await resolve({ id, decision });
      if (outcome.batch) onBatchResult(outcome.batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that decision.");
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  const acceptSuggestions = async () => {
    setBusy("all");
    setError(null);
    try {
      const outcome = await acceptAll({ batchId });
      if (outcome.batch) onBatchResult(outcome.batch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply the suggestions.");
    } finally {
      setBusy(null);
      await refresh();
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center gap-2 p-5 font-mono text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading possible duplicates…
      </div>
    );
  }
  const open = decisions.filter((d) => d.status === "pending");
  if (decisions.length === 0) return null;

  return (
    <section className="space-y-4 border-b border-amber-900/40 bg-amber-950/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-amber-300">
            <GitCompare className="h-4 w-4" />
            {open.length > 0
              ? `${open.length} possible duplicate${open.length === 1 ? "" : "s"} to review`
              : "Possible duplicates — all decided"}
          </h3>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
            These look very like questions already published. Decide whether each is the same
            question (it will be linked, and its wording remembered so it's recognised next time) or
            a different one (published as new). The rest of the batch is already published.
          </p>
        </div>
        {open.length > 1 && (
          <button
            type="button"
            onClick={acceptSuggestions}
            disabled={!!busy || !!disabledReason}
            title={disabledReason ?? undefined}
            className="flex items-center gap-1.5 rounded-lg border border-amber-700/70 bg-amber-900/30 px-3 py-2 font-mono text-xs text-amber-200 transition-colors hover:bg-amber-900/60 disabled:opacity-50"
          >
            {busy === "all" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Accept all {open.length} suggestions
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 font-mono text-xs text-rose-200">
          {error}
        </p>
      )}

      {decisions.map((d) => {
        const diff = diffWords(d.existing.text, d.candidate.text);
        const decided = d.status !== "pending";
        return (
          <article
            key={d.id}
            className={`rounded-xl border p-4 ${
              decided
                ? "border-slate-800 bg-slate-950/40 opacity-70"
                : "border-slate-700 bg-slate-950/70"
            }`}
          >
            <header className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px]">
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
                Question {d.questionNumber}
              </span>
              <span className="text-slate-400">
                {Math.round(d.similarity * 100)}% similar wording
              </span>
              <span className={d.optionsMatch ? "text-emerald-400" : "text-amber-300"}>
                · options {d.optionsMatch ? "identical" : "differ"}
              </span>
              <span className={d.answerMatch ? "text-emerald-400" : "text-amber-300"}>
                · correct answer {d.answerMatch ? "identical" : "differs"}
              </span>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-800 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Already published
                  {d.existing.appearsIn.length > 0 && (
                    <span className="normal-case tracking-normal text-slate-500">
                      {" "}
                      — in {d.existing.appearsIn.join("; ")}
                    </span>
                  )}
                </p>
                <p className="text-sm leading-relaxed text-slate-200">
                  <Diffed tokens={diff.existing} tone="removed" />
                </p>
                <OptionList options={d.existing.options} />
              </div>
              <div className="rounded-lg border border-slate-800 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  New in this batch
                </p>
                <p className="text-sm leading-relaxed text-slate-200">
                  <Diffed tokens={diff.candidate} tone="added" />
                </p>
                <OptionList options={d.candidate.options} />
              </div>
            </div>

            <footer className="mt-4 flex flex-wrap items-center gap-2">
              {decided ? (
                <span className="flex items-center gap-1.5 font-mono text-xs text-slate-300">
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
                  {STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]}
                </span>
              ) : (
                (["same", "different", "skip"] as const).map((choice) => {
                  const suggested = d.suggestion === choice;
                  return (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => decide(d.id, choice)}
                      disabled={!!busy || !!disabledReason}
                      title={disabledReason ?? undefined}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors disabled:opacity-50 ${
                        suggested
                          ? "border-emerald-600 bg-emerald-700/80 text-white hover:bg-emerald-600"
                          : "border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                      }`}
                    >
                      {busy === d.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : choice === "same" ? (
                        <Copy className="h-3.5 w-3.5" />
                      ) : choice === "skip" ? (
                        <SkipForward className="h-3.5 w-3.5" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {DECISION_LABEL[choice]}
                      {suggested && (
                        <span className="rounded bg-black/25 px-1 text-[9px] uppercase tracking-wider">
                          Suggested
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </footer>
          </article>
        );
      })}
    </section>
  );
}
