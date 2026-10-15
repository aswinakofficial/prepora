import katex from "katex";
import { Marked, type Tokens } from "marked";

// docs/specs/12-math-display.md: the one renderer for question text, options and explanations.
// Public pages get its HTML from the API (rendered on the server); the admin review page calls it
// in the browser. It imports only marked and katex, and client code imports it directly (not
// through "@prepora/api/src/shared", which would put KaTeX in every page's main chunk). Its output is the only HTML the app injects into pages, so raw HTML in
// the source is always escaped, links are limited to safe schemes, and images are never created.

export type TextFormat = "plain" | "markdown";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// http(s), mailto, a path on this site ("/x", but not "//host" or "/\\host", which browsers read as
// another host) or a fragment.
const SAFE_HREF = /^(https?:|mailto:|\/(?![/\\])|#)/i;

function renderMath(tex: string, display: boolean): string {
  return katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    errorColor: "#b91c1c",
  });
}

// Math is part of the Markdown grammar, not a pass over its output: `$…$` and `$$…$$` become tokens
// that marked never looks inside (so `_` and `*` stay math), and a `$` in a link target, an
// autolink, a bare URL or a code span is never math, because those are consumed first.
interface MathToken {
  type: string;
  raw: string;
  text: string;
}

const blockMath = {
  name: "mathBlock",
  level: "block" as const,
  start(src: string) {
    const m = /(^|\n)\$\$/.exec(src);
    return m ? m.index + m[1].length : undefined;
  },
  tokenizer(src: string): MathToken | undefined {
    const m = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
    if (m && m[1].trim() !== "") return { type: "mathBlock", raw: m[0], text: m[1].trim() };
  },
  renderer(token: Tokens.Generic) {
    return `${renderMath(token.text, true)}\n`;
  },
};

const inlineMath = {
  name: "mathInline",
  level: "inline" as const,
  start(src: string) {
    const i = src.indexOf("$");
    return i === -1 ? undefined : i;
  },
  tokenizer(src: string): (MathToken & { display: boolean }) | undefined {
    const display = /^\$\$([\s\S]+?)\$\$/.exec(src);
    if (display && display[1].trim() !== "") {
      return { type: "mathInline", raw: display[0], text: display[1].trim(), display: true };
    }
    // Prose such as "costs $5 and $6" isn't math: the span can't start or end with a space, sits on
    // one line, and its closing "$" isn't followed by a digit.
    const inline = /^\$(?!\s)((?:\\.|[^\\$\n])+?)(?<!\s)\$(?!\d)/.exec(src);
    if (inline) return { type: "mathInline", raw: inline[0], text: inline[1], display: false };
  },
  renderer(token: Tokens.Generic) {
    return renderMath(token.text, Boolean(token.display));
  },
};

function makeMarked(inlineOnly: boolean) {
  return new Marked({
    gfm: true,
    breaks: false,
    extensions: [blockMath, inlineMath],
    renderer: {
      // Raw HTML in the source is shown as text.
      html(token: Tokens.HTML | Tokens.Tag) {
        return escapeHtml(token.text);
      },
      // An image would be an element the author didn't get to vet; show its alt text instead.
      image(token: Tokens.Image) {
        return escapeHtml(token.text);
      },
      link(this: { parser: { parseInline(t: Tokens.Generic[]): string } }, token: Tokens.Link) {
        const inner = this.parser.parseInline(token.tokens as Tokens.Generic[]);
        // Inline mode is for text that sits inside a link already (a list row), so no nested <a>.
        if (inlineOnly || !SAFE_HREF.test(token.href.trim())) return inner;
        return `<a href="${escapeHtml(token.href)}" rel="noopener noreferrer nofollow">${inner}</a>`;
      },
    },
  });
}

const marked = makeMarked(false);
const markedInline = makeMarked(true);

/** Renders a question's text, an option or an explanation to safe HTML. */
export function renderRichText(text: string, format: TextFormat | string = "plain"): string {
  if (format !== "markdown") return escapeHtml(text).replace(/\r?\n/g, "<br>");
  return (marked.parse(text, { async: false }) as string).trim();
}

/**
 * The same, for a single line that sits inside something else (a list row that is itself a link,
 * the correct-answer line): no paragraphs or code blocks, and links are shown as their text.
 */
export function renderRichTextInline(text: string, format: TextFormat | string = "plain"): string {
  if (format !== "markdown") return escapeHtml(text).replace(/\s*\r?\n\s*/g, " ");
  return (markedInline.parseInline(text, { async: false }) as string).trim();
}
