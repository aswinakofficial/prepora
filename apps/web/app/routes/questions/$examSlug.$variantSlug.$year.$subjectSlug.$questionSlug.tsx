import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { getAnonymousSessionId } from "../../../lib/anonymous-session";
import { orpc } from "../../../lib/orpc";

export const Route = createFileRoute(
  "/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug",
)({
  head: ({ params }) => {
    const examName = params.examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${examName} — Q: ${params.questionSlug.replace(/-/g, " ")}`;
    return {
      meta: [
        { title: `${title} | Prepora` },
        {
          name: "description",
          content: `${title} with detailed verified answer and step-by-step explanation.`,
        },
      ],
    };
  },
  component: QuestionPage,
});

// docs/roadmap/engineering-roadmap.md item 24: this page used to render a fixed Strength-of-
// Materials fixture (DEMO_QUESTION) for every URL, with "related questions" and "additional
// reading" sections that never had a real backing model. It now resolves the real question via
// questions.getByPath and reveals the answer through the existing, server-verified submitAnswer
// mutation; the unbacked sections have been removed rather than kept as placeholder content.
//
// docs/roadmap/engineering-roadmap.md item 25: submitAnswer is public now (it persists a real
// `attempts` row via userId or an anonymous sessionId), so the "sign in to reveal" gate this page
// had is gone — anonymous visitors can reveal answers too. This also fixes a real bug: selection
// and the correct-answer lookup were comparing option *keys* ("A") against `selectedOptionId`/
// `correctOptionId`, which are option *ids* — they could never have matched. Options only gained a
// real `id` field in this item; before that there was nothing correct to compare against.

function QuestionPage() {
  const { examSlug, variantSlug, year, subjectSlug, questionSlug } = Route.useParams();
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const examName = examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: question, isLoading } = useQuery(
    orpc.questions.getByPath.queryOptions({
      input: { examSlug, variantSlug, year: Number(year), subjectSlug, questionSlug },
    }),
  );

  const {
    mutate: submitAnswer,
    data: result,
    isPending,
    error,
  } = useMutation(orpc.questions.submitAnswer.mutationOptions());

  const handleReveal = () => {
    if (selectedOptionId && question) {
      submitAnswer({
        id: question.id,
        selectedOptionId,
        sessionId: getAnonymousSessionId(),
      });
    }
  };

  const isRevealed = !!result;
  const correctOption = question?.options.find((o) => o.id === result?.correctOptionId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans flex items-center justify-center">
        <p className="font-mono text-sm text-slate-500">Loading question…</p>
      </div>
    );
  }

  if (!question) {
    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans flex flex-col items-center justify-center px-6 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500 mb-4">
          Question not found
        </p>
        <h1 className="text-2xl text-white font-light tracking-tight mb-8 max-w-lg">
          This question either isn't published yet or the URL is wrong.
        </h1>
        <Link
          to="/exams/$examSlug"
          params={{ examSlug }}
          className="font-mono text-xs uppercase tracking-widest text-black bg-white hover:bg-slate-200 px-6 py-3 font-semibold transition-colors"
        >
          Back to {examName}
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      <div className="px-6 pt-12 max-w-[800px] mx-auto mb-16"></div>

      <main className="max-w-[800px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-widest text-slate-500 uppercase mb-24 cursor-default">
          <Link
            to="/exams/$examSlug"
            params={{ examSlug }}
            className="hover:text-white transition-colors"
          >
            {examName}
          </Link>
          <span className="mx-2">/</span>
          <span>{subjectSlug.replace(/-/g, " ")}</span>
          <span className="mx-2">/</span>
          <span>{year}</span>
        </div>

        {/* Question Reading Area */}
        <section className="mb-24">
          <p className="text-3xl md:text-4xl text-white font-light leading-snug mb-16 max-w-2xl">
            {question.text}
          </p>

          <div className="flex flex-col space-y-6 mb-16 text-xl">
            {question.options.map((opt) => (
              <button
                type="button"
                key={opt.id}
                onClick={() => !isRevealed && setSelectedOptionId(opt.id)}
                disabled={isRevealed}
                className={`flex text-left transition-colors group ${
                  isRevealed ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span
                  className={`font-mono w-12 shrink-0 ${
                    selectedOptionId === opt.id
                      ? "text-white"
                      : "text-slate-600 group-hover:text-slate-400"
                  }`}
                >
                  {opt.key}
                </span>
                <span
                  className={`${
                    selectedOptionId === opt.id
                      ? "text-white"
                      : "text-slate-400 group-hover:text-slate-300"
                  }`}
                >
                  {opt.text}
                </span>
              </button>
            ))}
          </div>

          {!isRevealed ? (
            <button
              type="button"
              onClick={handleReveal}
              disabled={!selectedOptionId || isPending}
              className={`font-mono text-sm tracking-widest uppercase border-b pb-1 transition-colors ${
                selectedOptionId && !isPending
                  ? "text-slate-300 border-slate-500 hover:text-white hover:border-white"
                  : "text-slate-700 border-slate-900 cursor-not-allowed"
              }`}
            >
              {isPending ? "Checking…" : "Reveal answer"}
            </button>
          ) : (
            <div className="animate-fade-up">
              <div className="w-16 border-t border-slate-700 mb-12"></div>

              <div className="mb-12">
                <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-4">
                  Answer
                </h2>
                <p className="text-xl text-white">
                  {result.isCorrect ? "Correct" : "Incorrect"}
                  {correctOption && (
                    <>
                      {" "}
                      · {correctOption.key} · {correctOption.text}
                    </>
                  )}
                </p>
              </div>

              {result.explanation && (
                <div className="mb-24 border-l border-slate-800 pl-6">
                  <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-4">
                    Why
                  </h2>
                  <p className="text-lg text-slate-400 leading-relaxed max-w-2xl whitespace-pre-line">
                    {result.explanation}
                  </p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="font-mono text-xs text-rose-400 mt-6">
              Couldn't check your answer. Please try again.
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
