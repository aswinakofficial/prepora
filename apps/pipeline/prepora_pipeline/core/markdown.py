"""
Markdown escaping for connectors that publish `text_format = "markdown"`
(docs/specs/12-math-display.md).

A connector's prose is plain text that merely contains characters Markdown would read as formatting
(a C pointer's `*`, a variable named `my_var`, a price's `$`). escape_markdown backslash-escapes
them, so only the formatting the connector adds itself (fenced code blocks, `$…$` math) renders.
"""
import re

_FENCE = re.compile(r"^ {0,3}(`{3,}|~{3,})")
# Characters that can start formatting anywhere in a line. `&` is here because Markdown decodes
# entities such as `&lt;`; `<` because `<https://…>` is an autolink even with raw HTML disabled;
# `@` because a bare email address becomes a link.
_INLINE = re.compile(r"([\\`*_$\[\]~&|<@])")
# Bare URLs and www. addresses become links; escaping the scheme's ":" or the "www." dot
# keeps them text.
_AUTOLINK = re.compile(r"\b(https?|ftp):(?=//)|\b(www)\.", re.IGNORECASE)
# A line of only `-` or `=` under a paragraph line makes that line a heading (or `---` a rule).
_SETEXT = re.compile(r"^\s{0,3}([-=])[-=]*\s*$")
# Four or more spaces, or a tab, start an indented code block.
_INDENT = re.compile(r"^(?: {4}|\t)")
# Characters that only matter at the start of a line: headings, quotes, lists.
_LINE_START = re.compile(r"^(\s*)(#{1,6}(?=\s|$)|>|[-+](?=\s)|\d+[.)](?=\s))")


def _escape_line(line: str) -> str:
    setext = _SETEXT.match(line)
    if setext:
        i = line.index(setext.group(1))
        return f"{line[:i]}\\{line[i:]}"
    indented = _INDENT.match(line)
    line = _INLINE.sub(r"\\\1", line)
    line = _AUTOLINK.sub(lambda m: f"{m.group(1)}\\:" if m.group(1) else f"{m.group(2)}\\.", line)
    if indented:
        # An entity isn't indentation, so the line stays text instead of becoming a code block.
        line = "&#32;" + line[1:]

    def lead(match: re.Match) -> str:
        marker = match.group(2)
        if marker[-1] in ".)":
            return f"{match.group(1)}{marker[:-1]}\\{marker[-1]}"
        return f"{match.group(1)}\\{marker}"

    return _LINE_START.sub(lead, line, count=1)


def escape_markdown(text: str) -> str:
    """Escapes Markdown syntax in prose; fenced code blocks are left exactly as they are."""
    out: list[str] = []
    fence: str | None = None
    for line in text.split("\n"):
        match = _FENCE.match(line)
        if fence is None:
            if match:
                fence = match.group(1)
                out.append(line)
            else:
                out.append(_escape_line(line))
        else:
            out.append(line)
            if match and match.group(1)[0] == fence[0] and len(match.group(1)) >= len(fence):
                fence = None
    return "\n".join(out)
