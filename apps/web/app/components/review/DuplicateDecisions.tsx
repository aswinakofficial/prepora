import { useQuery } from "@tanstack/react-query";
import { CheckCircle, GitCompare, Loader2, Sparkles } from "lucide-react";
import type React from "react";
import { orpc } from "../../../lib/orpc";
import { type DiffToken, diffWords } from "../../../lib/word-diff";

// Possible duplicates held while approving a batch (packages/api's listDuplicateReviews): each new
// question side by side with the published question it resembles. The admin chooses per question —
// keep the published version, keep the new version, keep both (they're different questions), or
// skip the new one — and the batch's Approve & Publish applies those choices
// (approveWithDuplicateChoices). A question without a choice stays here for review.

export type DuplicateChoice = "keep_existing" | "keep_new" | "keep_both" | "skip";

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

function Choice({
  name,
  value,
  selected,
  suggested,
  disabled,
  onChoose,
  children,
}: {
  name: string;
  value: DuplicateChoice;
  selected: boolean;
  suggested: boolean;
  disabled: boolean;
  onChoose: (value: DuplicateChoice) => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex w-fit items-center gap-2 font-mono text-[11px] ${
        selected ? "text-emerald-300" : "text-slate-400 hover:text-slate-200"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <input
        type="radio"
        name={name}
        checked={selected}
        disabled={disabled}
        onChange={() => onChoose(value)}
        className="accent-emerald-500"
      />
      {children}
      {suggested && (
        <span className="rounded bg-amber-900/50 px-1.5 py-px text-[9px] uppercase tracking-wider text-amber-200">
          Suggested
        </span>
      )}
    </label>
  );
}

function panelClass(selected: boolean): string {
  return `rounded-lg border p-3 transition-colors ${
    selected ? "border-emerald-600/80 bg-emerald-950/15" : "border-slate-800"
  }`;
}

const suggestedChoice = (suggestion: "same" | "different"): DuplicateChoice =>
  suggestion === "same" ? "keep_existing" : "keep_both";

export function DuplicateDecisions({
  batchId,
  choices,
  onChoose,
  disabledReason,
}: {
  batchId: string;
  /** The admin's choice per decision id (unset = not decided yet). */
  choices: Record<string, DuplicateChoice>;
  onChoose: (decisionId: string, choice: DuplicateChoice) => void;
  /** Why choices can't be made here (e.g. publishing is locked on the deployed site). */
  disabledReason?: string | null;
}) {
  const { data: decisions = [], isPending } = useQuery(
    orpc.admin.listDuplicateReviews.queryOptions({ input: { batchId } }),
  );

  if (isPending) {
    return (
      <div className="flex items-center gap-2 p-5 font-mono text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading possible duplicates…
      </div>
    );
  }
  const open = decisions.filter((d) => d.status === "pending");
  if (open.length === 0) return null;

  const chosen = open.filter((d) => choices[d.id]).length;
  const disabled = !!disabledReason;

  return (
    <section className="space-y-4 border-b border-amber-900/40 bg-amber-950/10 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-amber-300">
            <GitCompare className="h-4 w-4" />
            {open.length} possible duplicate{open.length === 1 ? "" : "s"} to review
            {chosen > 0 && (
              <span className="normal-case tracking-normal text-emerald-300">
                · {chosen} of {open.length} chosen
              </span>
            )}
          </h3>
          <p className="max-w-2xl text-xs leading-relaxed text-slate-400">
            The rest of this batch is already published. For each question below, choose which
            version to keep — or keep both if they're different questions — then click{" "}
            <span className="text-slate-200">Approve &amp; Publish</span>. Questions you leave
            unchosen stay here for later. The wording you don't keep is remembered, so it's
            recognised next time.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            for (const d of open) onChoose(d.id, suggestedChoice(d.suggestion));
          }}
          disabled={disabled}
          title={disabledReason ?? undefined}
          className="flex items-center gap-1.5 rounded-lg border border-amber-700/70 bg-amber-900/30 px-3 py-2 font-mono text-xs text-amber-200 transition-colors hover:bg-amber-900/60 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Use suggestions
        </button>
      </div>

      {open.map((d) => {
        const diff = diffWords(d.existing.text, d.candidate.text);
        const choice = choices[d.id];
        const suggestion = suggestedChoice(d.suggestion);
        const radio = (value: DuplicateChoice, label: React.ReactNode) => (
          <Choice
            name={`dup-${d.id}`}
            value={value}
            selected={choice === value}
            suggested={suggestion === value}
            disabled={disabled}
            onChoose={(v) => onChoose(d.id, v)}
          >
            {label}
          </Choice>
        );
        return (
          <article key={d.id} className="rounded-xl border border-slate-700 bg-slate-950/70 p-4">
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
              <div className={panelClass(choice === "keep_existing")}>
                <div className="mb-2">{radio("keep_existing", "Keep this version")}</div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  Already published
                  {d.existing.appearsIn.length > 0 && (
                    <span className="normal-case tracking-normal">
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
              <div className={panelClass(choice === "keep_new")}>
                <div className="mb-2">{radio("keep_new", "Keep this version")}</div>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  New in this batch
                </p>
                <p className="text-sm leading-relaxed text-slate-200">
                  <Diffed tokens={diff.candidate} tone="added" />
                </p>
                <OptionList options={d.candidate.options} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
              {radio("keep_both", "Keep both — they're different questions")}
              {radio("skip", "Skip the new one — don't publish it")}
            </div>
          </article>
        );
      })}
    </section>
  );
}
