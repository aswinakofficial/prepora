// /api/health's body (served from app/ssr.tsx). `commit` is the git SHA of the deployed build, so
// the Release workflow knows when a merge is live (docs/specs/16-engineering-team.md, decision 6).

declare const __PREPORA_COMMIT__: string | null;

export function deployedCommit(): string | null {
  return typeof __PREPORA_COMMIT__ === "undefined" ? null : __PREPORA_COMMIT__;
}

export function healthBody(
  database: "connected" | "unreachable",
  commit: string | null = deployedCommit(),
  now: Date = new Date(),
) {
  return {
    status: database === "connected" ? "ok" : "degraded",
    timestamp: now.toISOString(),
    database,
    commit,
  };
}
