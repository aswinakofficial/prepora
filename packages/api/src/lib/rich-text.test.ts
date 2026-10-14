import { describe, expect, it } from "vitest";
import { renderRichText } from "./rich-text.js";

describe("renderRichText plain", () => {
  it("escapes and keeps line breaks, leaving markdown characters literal", () => {
    expect(renderRichText("a *b* _c_ $d$\nline <b>x</b>", "plain")).toBe(
      "a *b* _c_ $d$<br>line &lt;b&gt;x&lt;/b&gt;",
    );
  });
});

describe("renderRichText markdown", () => {
  it("renders inline math with KaTeX", () => {
    const html = renderRichText("Let $L_1 \\cup L_2$ be", "markdown");
    expect(html).toContain('class="katex"');
    expect(html).not.toContain("$L_1");
    expect(html).toContain("∪");
  });

  it("renders display math as a display block", () => {
    const html = renderRichText("$$\\frac{n(n-1)}{2}$$", "markdown");
    expect(html).toContain("katex-display");
    expect(html).toContain("mfrac");
  });

  it("renders a fenced code block verbatim, leaving dollars and underscores alone", () => {
    const html = renderRichText("```c\nint a_b = 1;\n  x = $y$;\n```", "markdown");
    expect(html).toContain("<pre><code");
    expect(html).toContain("  x = $y$;");
    expect(html).not.toContain("katex");
    expect(html).not.toContain("```");
  });

  it("keeps emphasis markers inside math out of Markdown", () => {
    const html = renderRichText("$a_1 * b_2$ and *real*", "markdown");
    expect(html).not.toContain("<em>a");
    expect(html).toContain("<em>real</em>");
  });

  it("escapes raw HTML and creates no elements", () => {
    const html = renderRichText("<img src=x onerror=alert(1)> and <script>x</script>", "markdown");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });

  it("drops images and unsafe links", () => {
    const html = renderRichText("![alt](http://x/y.png) [a](javascript:alert(1))", "markdown");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("javascript:");
  });

  it("shows an unparseable formula as its source in an error span", () => {
    const html = renderRichText("$\\frac{$", "markdown");
    expect(html).toContain("katex-error");
  });

  it("treats escaped dollars and prose prices as text", () => {
    expect(renderRichText("costs \\$5 and \\$6", "markdown")).toContain("costs $5 and $6");
    expect(renderRichText("costs $5 and $6", "markdown")).not.toContain("katex");
  });

  it("renders math inside option-like short text", () => {
    expect(renderRichText("$\\Theta(n^2)$", "markdown")).toContain("Θ");
  });
});
