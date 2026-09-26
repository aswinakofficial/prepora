import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { splitExplanationAndReadings } from "../../../lib/additional-reading";
import { trackEvent } from "../../../lib/analytics";
import { getAnonymousSessionId } from "../../../lib/anonymous-session";
import { isSelectionComplete, toggleSelection } from "../../../lib/answer-selection";
import { breadcrumbListJsonLd, canonicalLink, titleCase } from "../../../lib/json-ld";
import { orpc } from "../../../lib/orpc";
import { CANONICAL_ORIGIN } from "../../../lib/site-config";
import { QuestionImages } from "../../components/question/QuestionImages";
import { Skeleton, SkeletonRegion } from "../../components/ui/Skeleton";

export const Route = createFileRoute(
  "/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug",
)({
  head: ({ params }) => {
    const examName = titleCase(params.examSlug);
    const title = `${examName} — Q: ${params.questionSlug.replace(/-/g, " ")}`;
    const path = `/questions/${params.examSlug}/${params.variantSlug}/${params.year}/${params.subjectSlug}/${params.questionSlug}`;
    return {
      meta: [
        { title: `${title} | Prepora` },
        {
          name: "description",
          content: `${title} with detailed verified answer and step-by-step explanation.`,
        },
      ],
      links: [canonicalLink(path)],
      scripts: [
        breadcrumbListJsonLd([
          { name: "Home", path: "/" },
          { name: "Exams", path: "/exams" },
          { name: examName, path: `/exams/${params.examSlug}` },
          { name: titleCase(params.subjectSlug), path: `/subjects/${params.subjectSlug}` },
          { name: titleCase(params.questionSlug), path },
        ]),
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
  // Option ids chosen so far: one for a single-answer question, `answerCount` for "Choose N".
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);

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

  useEffect(() => {
    if (question) {
      trackEvent("question_view", { entityType: "question", entityId: question.id });
    }
  }, [question]);

  const required = question?.answerCount ?? 1;
  const isComplete = isSelectionComplete(selectedOptionIds, required);

  const handleReveal = () => {
    if (isComplete && question) {
      submitAnswer({
        id: question.id,
        selectedOptionIds,
        sessionId: getAnonymousSessionId(),
      });
      trackEvent("answer_reveal", { entityType: "question", entityId: question.id });
    }
  };

  const isRevealed = !!result;
  const correctOptions =
    question?.options.filter((o) => result?.correctOptionIds?.includes(o.id)) ?? [];

  if (isLoading) {
    // The question page's shape: breadcrumb, question text, options, reveal button.
    return (
      <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans">
        <SkeletonRegion
          label="Loading question…"
          className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 pb-32"
        >
          <Skeleton className="h-3 w-72 max-w-full mb-16" />
          <div className="space-y-4 mb-16 max-w-2xl">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-4/5" />
          </div>
          <div className="space-y-6 mb-16">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex gap-6">
                <Skeleton className="h-6 w-6 shrink-0" />
                <Skeleton className="h-6 w-2/3" />
              </div>
            ))}
          </div>
          <Skeleton className="h-12 w-44" />
        </SkeletonRegion>
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
      {/* docs/roadmap/engineering-roadmap.md item 26: Question JSON-LD, rendered here (not in
          head()) because it needs the real question useQuery fetches — see the exam page's
          identical note on why this app's routes render data-dependent JSON-LD inline instead.
          `acceptedAnswer` is only included once the user has actually revealed it: the correct
          option is never sent to the client before that (a deliberate item 24/25 design, not an
          oversight), so structured data can't honestly claim to know it either. */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify output, not user HTML.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Question",
            name: question.text,
            text: question.text,
            url: `${CANONICAL_ORIGIN}/questions/${examSlug}/${variantSlug}/${year}/${subjectSlug}/${questionSlug}`,
            suggestedAnswer: question.options.map((opt) => ({
              "@type": "Answer",
              text: opt.text,
            })),
            ...(isRevealed && correctOptions.length > 0
              ? {
                  // Every correct option — a "Choose N" question has more than one.
                  acceptedAnswer: correctOptions.map((option) => ({
                    "@type": "Answer",
                    text: option.text,
                  })),
                }
              : {}),
          }),
        }}
      />

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
          <p className="text-3xl md:text-4xl text-white font-light leading-snug mb-16 max-w-2xl whitespace-pre-line">
            {question.text}
          </p>
          <QuestionImages images={question.images} placement="question" className="-mt-8 mb-16" />

          {required > 1 && (
            <p className="-mt-8 mb-10 font-mono text-xs uppercase tracking-widest text-slate-400">
              Select {required} answers · {selectedOptionIds.length} of {required} selected
            </p>
          )}

          <div className="flex flex-col space-y-6 mb-16 text-xl">
            {question.options.map((opt) => (
              <button
                type="button"
                key={opt.id}
                aria-pressed={selectedOptionIds.includes(opt.id)}
                onClick={() =>
                  !isRevealed &&
                  setSelectedOptionIds((prev) => toggleSelection(prev, opt.id, required))
                }
                disabled={isRevealed}
                className={`flex text-left transition-colors group ${
                  isRevealed ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span
                  className={`font-mono w-12 shrink-0 ${
                    selectedOptionIds.includes(opt.id)
                      ? "text-white"
                      : "text-slate-600 group-hover:text-slate-400"
                  }`}
                >
                  {opt.key}
                </span>
                <span
                  className={`${
                    selectedOptionIds.includes(opt.id)
                      ? "text-white"
                      : "text-slate-400 group-hover:text-slate-300"
                  }`}
                >
                  {opt.text}
                  <QuestionImages
                    images={question.images}
                    placement="option"
                    optionKey={opt.key}
                    className="mt-3"
                  />
                </span>
              </button>
            ))}
          </div>

          {!isRevealed ? (
            <button
              type="button"
              onClick={handleReveal}
              disabled={!isComplete || isPending}
              className={`font-mono text-sm tracking-widest uppercase border-b pb-1 transition-colors ${
                isComplete && !isPending
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
                <p className="text-xl text-white">{result.isCorrect ? "Correct" : "Incorrect"}</p>
                <ul className="mt-3 space-y-1 text-lg text-slate-300">
                  {correctOptions.map((option) => (
                    <li key={option.id}>
                      {option.key} · {option.text}
                    </li>
                  ))}
                </ul>
              </div>

              {result.explanation &&
                (() => {
                  const { explanation, readings } = splitExplanationAndReadings(result.explanation);
                  return (
                    <div className="mb-24 border-l border-slate-800 pl-6">
                      <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-4">
                        Why
                      </h2>
                      <p className="text-lg text-slate-400 leading-relaxed max-w-2xl whitespace-pre-line">
                        {explanation}
                      </p>
                      <QuestionImages
                        images={result.explanationImages}
                        placement="explanation"
                        className="mt-6"
                      />
                      {readings.length > 0 && (
                        <div className="mt-8">
                          <h3 className="font-mono text-xs tracking-widest text-slate-500 uppercase mb-3">
                            Additional reading
                          </h3>
                          <ul className="space-y-2">
                            {readings.map((reading) => (
                              <li key={reading.url || reading.text} className="text-slate-400">
                                {reading.url ? (
                                  <a
                                    href={reading.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sky-300 hover:text-white hover:underline"
                                  >
                                    {reading.text} ↗
                                  </a>
                                ) : (
                                  reading.text
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })()}
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
