import type { ElementType } from "react";

// docs/specs/12-math-display.md: the only place the web app injects HTML. `html` comes from
// renderRichText (raw HTML disabled, KaTeX trust: false), rendered on the server for public pages.
// A plain-format question keeps showing its text exactly as before, as an escaped React child.
export function RichText({
  text,
  html,
  format,
  as: Tag = "div",
  className = "",
  plainClassName = "",
}: {
  text: string;
  html?: string | null;
  format?: string | null;
  as?: ElementType;
  className?: string;
  /** Extra classes for plain text only, e.g. whitespace-pre-line. */
  plainClassName?: string;
}) {
  if (format === "markdown" && html != null) {
    // Markdown output holds block elements (<p>, <pre>), so it's always a div, never a heading
    // or paragraph the caller asked for.
    return (
      <div
        data-testid="rich-text"
        data-format="markdown"
        className={`rich-text ${className}`.trim()}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by renderRichText
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return <Tag className={`${className} ${plainClassName}`.trim() || undefined}>{text}</Tag>;
}
