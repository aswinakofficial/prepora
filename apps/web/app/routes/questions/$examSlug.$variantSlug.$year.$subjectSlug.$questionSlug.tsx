import { createFileRoute, redirect } from "@tanstack/react-router";

// The old question URL, /questions/{exam}/{variant}/{year}/{subject}/{slug}. Questions now live at
// /questions/{slug} (docs/specs/01-question-urls.md); this keeps shared links working with a
// permanent redirect. No lookup needed — an unknown slug gets the new page's "not found" state.
export const Route = createFileRoute(
  "/questions/$examSlug/$variantSlug/$year/$subjectSlug/$questionSlug",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/questions/$questionSlug",
      params: { questionSlug: params.questionSlug },
      statusCode: 301,
    });
  },
});
