import type { FeatureFlagKey } from "@prepora/api";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useFeatureFlag } from "../../hooks/useFeatureFlag";

/**
 * Renders `children` only while the feature flag is on (and nothing — or `fallback` — otherwise,
 * including while flags are still loading). Wrap any link, button or section that belongs to a
 * gated feature:
 *
 *   <FeatureGate flag="contribute"><Link to="/contribute">Contribute</Link></FeatureGate>
 */
export function FeatureGate({
  flag,
  children,
  fallback = null,
}: {
  flag: FeatureFlagKey;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { enabled } = useFeatureFlag(flag);
  return <>{enabled ? children : fallback}</>;
}

/**
 * The standard page for a switched-off feature — for someone who arrives at the feature's page
 * directly (a bookmark, an old link) while its flag is off.
 */
export function FeatureUnavailable({
  eyebrow = "Currently unavailable",
  title,
}: {
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="min-h-[60vh] bg-[#06080a] text-slate-300 font-sans flex items-center justify-center px-4 sm:px-6">
      <div className="max-w-md text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-slate-500 mb-4">{eyebrow}</p>
        <h1 className="text-2xl md:text-3xl text-white font-light tracking-tight mb-8">{title}</h1>
        <Link
          to="/exams"
          className="inline-block font-mono text-xs uppercase tracking-widest text-black bg-white hover:bg-slate-200 px-6 py-3 font-semibold transition-colors"
        >
          Browse exams
        </Link>
      </div>
    </div>
  );
}
