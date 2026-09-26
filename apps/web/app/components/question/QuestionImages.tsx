// Renders a question's images for one placement — the stem, one option, or the explanation.
// Images are attached per placement, not at an exact position inside the text, so they're shown
// directly below the text they belong to.

export interface QuestionImage {
  url: string;
  placement: "question" | "option" | "explanation";
  optionKey: string | null;
  alt: string | null;
}

export function QuestionImages({
  images,
  placement,
  optionKey,
  className = "",
}: {
  images?: QuestionImage[] | null;
  placement: QuestionImage["placement"];
  optionKey?: string;
  className?: string;
}) {
  const shown = (images ?? []).filter(
    (image) =>
      image.placement === placement && (placement !== "option" || image.optionKey === optionKey),
  );
  if (shown.length === 0) return null;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {shown.map((image) => (
        <img
          key={image.url}
          src={image.url}
          alt={image.alt || ""}
          loading="lazy"
          className="max-w-full h-auto rounded border border-slate-800 bg-white"
        />
      ))}
    </div>
  );
}
