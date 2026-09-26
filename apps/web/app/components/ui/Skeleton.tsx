// Loading placeholders for the public pages, so every page pulses the same way while its data
// loads. Each page composes these into the shape of its own content (see e.g. the exam directory
// and exam hub), so nothing jumps when the real data arrives.

import type { ReactNode } from "react";

/** Stable React keys for a fixed number of placeholders (["row-0", "row-1", …]). */
export function placeholderKeys(count: number, prefix = "placeholder"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

/** One pulsing block — size and shape come from `className` (h-*, w-*, rounded-*). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`rounded bg-slate-900/80 animate-pulse ${className}`} />
  );
}

/**
 * Wraps a page region's skeletons: marks it busy for assistive tech and announces what is loading,
 * since the placeholder blocks themselves are hidden from screen readers.
 */
export function SkeletonRegion({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * Placeholder rows for the numbered question/topic lists (subject, topic, question-set and
 * exam-subject pages): a number, a line of text, and trailing meta — the shape of the real rows.
 */
export function SkeletonListRows({
  label,
  count = 6,
  withTagLine = false,
}: {
  label: string;
  count?: number;
  /** Topic pages show exam/year/difficulty tags above each question. */
  withTagLine?: boolean;
}) {
  const widths = ["w-11/12", "w-3/4", "w-5/6", "w-2/3", "w-4/5", "w-3/5"];
  return (
    <SkeletonRegion label={label}>
      {placeholderKeys(count, "row").map((key, i) => (
        <div
          key={key}
          className="p-6 border-b border-slate-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4"
        >
          <div className="flex-1 min-w-0 space-y-3">
            {withTagLine && (
              <div className="flex gap-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-12" />
              </div>
            )}
            <div className="flex items-center gap-6">
              <Skeleton className="h-4 w-8 shrink-0" />
              <Skeleton className={`h-5 ${widths[i % widths.length]}`} />
            </div>
          </div>
          <Skeleton className="h-3 w-20 shrink-0 ml-14 md:ml-0" />
        </div>
      ))}
    </SkeletonRegion>
  );
}
