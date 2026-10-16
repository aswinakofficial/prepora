import { readFileSync } from "node:fs";
import katex from "katex";
import { describe, expect, it } from "vitest";
import { renderRichText } from "./rich-text.js";

// docs/specs/13-math-recovery.md, Decision 3: the math rebuild (apps/pipeline/prepora_pipeline/
// core/math_rebuild.py) emits only what's in its committed table, and only constructs KaTeX takes.
// This test renders the whole table and every pinned rebuild output with KaTeX set to throw, so a
// table entry or a rebuild change KaTeX would reject fails here, not on the site.
const core = new URL("../../../../apps/pipeline/prepora_pipeline/core/", import.meta.url);
const table = JSON.parse(readFileSync(new URL("latex_symbols.json", core), "utf8")) as {
  chars: Record<string, string>;
  operators: Record<string, string>;
  symbol_pua: Record<string, string>;
  symbol_latin: Record<string, string>;
};
const fixture = JSON.parse(readFileSync(new URL("fixtures/math_rebuild.json", core), "utf8")) as {
  cases: { name: string; markdown: string; formulas: string[] }[];
};

function strict(tex: string): string {
  return katex.renderToString(tex, { throwOnError: true, strict: "error", trust: false });
}

describe("the rebuild's symbol table renders", () => {
  const entries = [
    ...Object.entries(table.chars),
    ...Object.entries(table.operators),
    ...Object.entries(table.symbol_pua),
    ...Object.entries(table.symbol_latin),
  ];

  it("has entries", () => {
    expect(entries.length).toBeGreaterThan(300);
  });

  for (const [from, tex] of entries) {
    const label = [...from].map((c) => `U+${c.codePointAt(0)?.toString(16).toUpperCase()}`);
    it(`${label.join(" ")} -> ${tex}`, () => {
      expect(() => strict(`x ${tex}\\ y`)).not.toThrow();
      expect(() => strict(`a_{${tex}}^{${tex}}`)).not.toThrow();
    });
  }
});

describe("the rebuild's pinned outputs render", () => {
  it("has cases", () => {
    expect(fixture.cases.length).toBeGreaterThan(10);
  });

  for (const c of fixture.cases) {
    it(c.name, () => {
      for (const tex of c.formulas) {
        expect(() => strict(tex)).not.toThrow();
      }
      const html = renderRichText(c.markdown, "markdown");
      expect(html).not.toContain("katex-error");
      if (c.formulas.length > 0) {
        expect(html).toContain('class="katex"');
        expect(html).not.toContain("$");
      }
    });
  }
});
