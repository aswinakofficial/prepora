import { getAnonymousSessionId } from "./anonymous-session";
import { orpcClient } from "./orpc";

// docs/roadmap/engineering-roadmap.md item 27: batches interactions client-side and flushes
// periodically instead of firing one request per event, per the item's explicit note. Uses the
// same anonymous sessionId as item 25's practice attempts (apps/web/lib/anonymous-session.ts) so
// signed-out activity can still be attributed to one browser without identifying a person; the
// server (analytics.router.ts) drops the sessionId entirely once a real userId is available.
//
// Fire-and-forget by design: a failed analytics call is swallowed, never surfaced to the user or
// thrown from `trackEvent` — this is instrumentation, not a feature the app depends on.

type EventType =
  | "page_view"
  | "search"
  | "result_click"
  | "question_view"
  | "answer_reveal"
  | "practice_start"
  | "practice_complete"
  | "contribution";

interface TrackEventOptions {
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

interface QueuedEvent extends TrackEventOptions {
  event: EventType;
}

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 20;

const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    await orpcClient.analytics.track({ events: batch, sessionId: getAnonymousSessionId() });
  } catch {
    // Best-effort — see module comment.
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

export function trackEvent(event: EventType, options?: TrackEventOptions) {
  if (typeof window === "undefined") return;

  queue.push({ event, ...options });
  if (queue.length >= MAX_BATCH_SIZE) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    flush();
  } else {
    scheduleFlush();
  }
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
