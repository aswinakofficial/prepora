import type { ElementType } from "react";

// docs/specs/12-math-display.md: the only place the web app injects HTML. `html` comes from
// renderRichText (raw HTML disabled, KaTeX trust: false), rendered on the server for public pages.
// A plain-format question keeps showing its text exactly as before, as an escaped React child.
export function RichText({
  text,
  html,
  format,
  inline = false,
  as: Tag = inline ? "span" : "div",
  className = "",
  plainClassName = "",
}: {
  text: string;
  html?: string | null;
  format?: string | null;
  /** Render `html` (from the API's inline renderer) as a span, for a line inside a link or list. */
  inline?: boolean;
  as?: ElementType;
  className?: string;
  /** Extra classes for plain text only, e.g. whitespace-pre-line. */
  plainClassName?: string;
}) {
  if (format === "markdown" && html != null) {
    // Block markdown output holds <p> and <pre>, so it's always a div, never a heading or
    // paragraph the caller asked for; inline output is phrasing content only, so a span.
    const Wrapper = inline ? "span" : "div";
    return (
      <Wrapper
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
