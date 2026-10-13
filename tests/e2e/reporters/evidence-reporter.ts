import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";

// Writes the "Acceptance evidence" summary (docs/specs/16-engineering-team.md, decision 4): for
// every acceptance test, each acceptance step with its result and screenshot, and the test's video.
// CI appends it to the job summary and uploads the files it names as the `acceptance-evidence`
// artifact, so a PR shows what the owner would have seen at each step without anyone running it.

interface Row {
  test: string;
  step: string;
  ok: boolean;
  screenshot?: string;
}

const OUT = "test-results/acceptance-evidence.md";

export default class EvidenceReporter implements Reporter {
  private rows: Row[] = [];
  private videos: Array<{ test: string; file: string }> = [];

  onTestEnd(test: TestCase, result: TestResult): void {
    if (!test.location.file.includes("/acceptance/")) return;
    const title = test.titlePath().slice(-1)[0];
    const steps = result.steps.flatMap(function walk(s: TestStep): TestStep[] {
      return s.category === "test.step" ? [s] : s.steps.flatMap(walk);
    });
    for (const s of steps) {
      const shot = result.attachments.find((a) => a.name === `evidence: ${s.title}` && a.path);
      this.rows.push({
        test: title,
        step: s.title,
        ok: !s.error,
        screenshot: shot?.path
          ? basename(dirname(shot.path)) + "/" + basename(shot.path)
          : undefined,
      });
    }
    if (steps.length === 0)
      this.rows.push({ test: title, step: "(no steps)", ok: result.status === "passed" });
    const video = result.attachments.find((a) => a.name === "video" && a.path);
    if (video?.path)
      this.videos.push({
        test: title,
        file: `${basename(dirname(video.path))}/${basename(video.path)}`,
      });
  }

  onEnd(result: FullResult): void {
    if (this.rows.length === 0) return;
    const lines = [
      "## Acceptance evidence",
      "",
      `Overall: **${result.status}**. Files are in this run's \`acceptance-evidence\` artifact.`,
      "",
      "| Test | Step | Result | Screenshot |",
      "|---|---|---|---|",
      ...this.rows.map(
        (r) =>
          `| ${r.test} | ${r.step} | ${r.ok ? "✅ pass" : "❌ fail"} | ${r.screenshot ?? "—"} |`,
      ),
      "",
      "| Test | Video |",
      "|---|---|",
      ...this.videos.map((v) => `| ${v.test} | ${v.file} |`),
      "",
    ];
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, lines.join("\n"));
  }
}
