import React, { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug",
)({
  head: ({ params }) => {
    const examName = params.examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const title = `${examName} — Q: ${params.questionSlug.replace(/-/g, " ")}`;
    return {
      meta: [
        { title: `${title} | Prepora` },
        { name: "description", content: `${title} with detailed verified answer and step-by-step explanation.` },
      ],
    };
  },
  component: QuestionPage,
});

const DEMO_QUESTION = {
  text: "What is the SI unit of Modulus of Elasticity (Young's Modulus)?",
  options: [
    { key: "A", text: "Newton (N)" },
    { key: "B", text: "N/mm² (or Pascal, Pa)" },
    { key: "C", text: "mm / N" },
    { key: "D", text: "N · mm" },
  ],
  correctKey: "B",
  explanation: {
    summary: "Modulus of elasticity is defined as the ratio of tensile stress to tensile strain within the elastic limit.",
    derivation: [
      "Stress (σ) has dimensions of Force / Area, measured in N/m² or N/mm² (Pascal).",
      "Strain (ε) is the ratio of change in length to original length (ΔL / L), making it dimensionless.",
      "Therefore, E shares the exact same unit as Stress, which is N/mm² or Pa.",
    ],
  },
  topic: "Elasticity & Hooke's Law",
  subject: "Strength of Materials",
  relatedQuestions: [
    { slug: "poissons-ratio-definition", text: "What is the theoretical range of Poisson's ratio for isotropic materials?" },
    { slug: "shear-modulus-relationship", text: "Which formula relates Young's Modulus (E) and Shear Modulus (G)?" },
  ],
};

function QuestionPage() {
  const { examSlug, variantSlug, year, subjectSlug } = Route.useParams();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const examName = examSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const handleReveal = () => {
    if (selectedKey) setIsRevealed(true);
  };

  const correctOption = DEMO_QUESTION.options.find((o) => o.key === DEMO_QUESTION.correctKey);

  return (
    <div className="min-h-screen bg-[#06080a] text-slate-300 font-sans selection:bg-slate-700 selection:text-white pb-32">
      
      {/* Header */}
      <header className="px-6 py-8 flex justify-between items-center max-w-[800px] mx-auto mb-16">
        <Link to="/" className="font-mono text-sm tracking-widest text-slate-500 hover:text-white transition-colors">
          PREPORA
        </Link>
      </header>

      <main className="max-w-[800px] mx-auto px-6">
        {/* Context Rail */}
        <div className="font-mono text-xs tracking-widest text-slate-500 uppercase mb-24 cursor-default">
          <Link to="/exams/$examSlug" params={{ examSlug }} className="hover:text-white transition-colors">
            {examName}
          </Link>
          <span className="mx-2">/</span>
          <span>{DEMO_QUESTION.subject}</span>
          <span className="mx-2">/</span>
          <span>{year}</span>
        </div>

        {/* Question Reading Area */}
        <section className="mb-24">
          <h1 className="font-mono text-lg tracking-widest text-slate-500 mb-12">
            QUESTION 015
          </h1>
          
          <p className="text-3xl md:text-4xl text-white font-light leading-snug mb-16 max-w-2xl">
            {DEMO_QUESTION.text}
          </p>

          <div className="flex flex-col space-y-6 mb-16 text-xl">
            {DEMO_QUESTION.options.map((opt) => (
              <button
                key={opt.key}
                onClick={() => !isRevealed && setSelectedKey(opt.key)}
                disabled={isRevealed}
                className={`flex text-left transition-colors group ${
                  isRevealed ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <span className={`font-mono w-12 shrink-0 ${
                  selectedKey === opt.key ? "text-white" : "text-slate-600 group-hover:text-slate-400"
                }`}>
                  {opt.key}
                </span>
                <span className={`${
                  selectedKey === opt.key ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                }`}>
                  {opt.text}
                </span>
              </button>
            ))}
          </div>

          {!isRevealed ? (
            <button
              onClick={handleReveal}
              disabled={!selectedKey}
              className={`font-mono text-sm tracking-widest uppercase border-b pb-1 transition-colors ${
                selectedKey
                  ? "text-slate-300 border-slate-500 hover:text-white hover:border-white"
                  : "text-slate-700 border-slate-900 cursor-not-allowed"
              }`}
            >
              Reveal answer
            </button>
          ) : (
            <div className="animate-fade-up">
              <div className="w-16 border-t border-slate-700 mb-12"></div>
              
              <div className="mb-12">
                <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-4">Answer</h2>
                <p className="text-xl text-white">
                  {correctOption?.key} · {correctOption?.text}
                </p>
              </div>

              <div className="mb-24 border-l border-slate-800 pl-6">
                <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-4">Why</h2>
                <div className="text-lg text-slate-400 leading-relaxed space-y-4 max-w-2xl">
                  <p>{DEMO_QUESTION.explanation.summary}</p>
                  <ul className="space-y-4 list-decimal list-outside ml-4 mt-6 text-slate-500">
                    {DEMO_QUESTION.explanation.derivation.map((step, idx) => (
                      <li key={idx} className="pl-2">
                        {step}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Continuation */}
        {isRevealed && (
          <section className="border-t border-slate-900 pt-16">
            <h2 className="font-mono text-sm tracking-widest text-slate-500 uppercase mb-8">Continue</h2>
            
            <div className="flex flex-col space-y-6">
              <div className="flex flex-col">
                <span className="text-sm text-slate-600 mb-2">Related questions</span>
                {DEMO_QUESTION.relatedQuestions.map((rq) => (
                  <Link
                    key={rq.slug}
                    to="/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug"
                    params={{ examSlug, variantSlug, year, subjectSlug, questionSlug: rq.slug }}
                    className="text-slate-300 hover:text-white transition-colors py-2 flex items-center gap-4"
                  >
                    <span className="text-slate-600">→</span> {rq.text}
                  </Link>
                ))}
              </div>

              <div className="pt-8">
                <Link to="/search" search={{ q: DEMO_QUESTION.topic }} className="text-slate-300 hover:text-white transition-colors flex items-center gap-4">
                  <span className="text-slate-600">→</span> Practice more on {DEMO_QUESTION.topic}
                </Link>
              </div>
            </div>
          </section>
        )}

      </main>
    </div>
  );
}

