import katex from "katex";
import { Marked, type Tokens } from "marked";

// docs/specs/12-math-display.md: the one renderer for question text, options and explanations.
// Public pages get its HTML from the API (rendered on the server); the admin review page calls it
// in the browser. It imports only marked and katex so client code can use it through
// "@prepora/api/src/shared". Its output is the only HTML the app injects into pages, so raw HTML in
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

const SAFE_HREF = /^(https?:|mailto:|\/|#)/i;

const marked = new Marked({
  gfm: true,
  breaks: false,
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
      if (!SAFE_HREF.test(token.href.trim())) return inner;
      return `<a href="${escapeHtml(token.href)}" rel="noopener noreferrer nofollow">${inner}</a>`;
    },
  },
});

interface MathSpan {
  tex: string;
  display: boolean;
}

/**
 * Pulls `$$…$$` and `$…$` spans out of the source, leaving a placeholder in their place, so
 * Markdown never sees the `_` and `*` inside math. `\$` is a literal dollar, and fenced or inline
 * code is left alone. An inline span must hold text that doesn't start or end with a space, so
 * prose like "costs $5 and $6" isn't read as math.
 */
function protectMath(
  text: string,
  mark: (n: number) => string,
): { out: string; spans: MathSpan[] } {
  const spans: MathSpan[] = [];
  let out = "";
  let i = 0;
  let atLineStart = true;
  const n = text.length;

  const push = (tex: string, display: boolean) => {
    spans.push({ tex, display });
    out += mark(spans.length - 1);
  };

  while (i < n) {
    const ch = text[i];

    // Fenced code block: copy through the closing fence untouched.
    if (atLineStart) {
      const fence = /^( {0,3})(`{3,}|~{3,})[^\n]*(\n|$)/.exec(text.slice(i, i + 400));
      if (fence) {
        const marker = fence[2];
        const close = new RegExp(`\\n {0,3}${marker[0]}{${marker.length},}[ \\t]*(\\n|$)`);
        const rest = text.slice(i + fence[0].length);
        const m = close.exec(rest);
        const end = m ? i + fence[0].length + m.index + m[0].length : n;
        out += text.slice(i, end);
        i = end;
        atLineStart = true;
        continue;
      }
    }

    if (ch === "\\" && i + 1 < n) {
      out += text.slice(i, i + 2);
      atLineStart = text[i + 1] === "\n";
      i += 2;
      continue;
    }

    if (ch === "`") {
      let run = 1;
      while (text[i + run] === "`") run++;
      const ticks = "`".repeat(run);
      const close = text.indexOf(ticks, i + run);
      if (close !== -1) {
        out += text.slice(i, close + run);
        i = close + run;
      } else {
        out += text.slice(i, i + run);
        i += run;
      }
      atLineStart = false;
      continue;
    }

    if (ch === "$") {
      if (text[i + 1] === "$") {
        const close = text.indexOf("$$", i + 2);
        if (close !== -1 && text.slice(i + 2, close).trim() !== "") {
          push(text.slice(i + 2, close).trim(), true);
          i = close + 2;
          atLineStart = false;
          continue;
        }
      } else {
        let j = i + 1;
        let found = -1;
        while (j < n && text[j] !== "\n") {
          if (text[j] === "\\") {
            j += 2;
            continue;
          }
          if (text[j] === "$") {
            found = j;
            break;
          }
          j++;
        }
        if (found !== -1) {
          const tex = text.slice(i + 1, found);
          if (tex !== "" && !/^\s|\s$/.test(tex) && !/\d/.test(text[found + 1] ?? "")) {
            push(tex, false);
            i = found + 1;
            atLineStart = false;
            continue;
          }
        }
      }
    }

    out += ch;
    atLineStart = ch === "\n";
    i++;
  }
  return { out, spans };
}

function renderMath(span: MathSpan): string {
  return katex.renderToString(span.tex, {
    displayMode: span.display,
    throwOnError: false,
    trust: false,
    strict: "ignore",
    errorColor: "#b91c1c",
  });
}

/** Renders a question's text, an option or an explanation to safe HTML. */
export function renderRichText(text: string, format: TextFormat | string = "plain"): string {
  if (format !== "markdown") return escapeHtml(text).replace(/\r?\n/g, "<br>");

  // A placeholder that doesn't occur in the source, made of letters so Markdown leaves it alone.
  let tag = "ppmath";
  while (text.includes(tag)) tag += "x";
  const { out, spans } = protectMath(text, (k) => `${tag}${k}${tag}`);

  const html = marked.parse(out, { async: false }) as string;
  return html
    .replace(new RegExp(`${tag}(\\d+)${tag}`, "g"), (_m, k: string) => renderMath(spans[Number(k)]))
    .trim();
}
