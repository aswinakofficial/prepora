const STORAGE_KEY = "prepora_anon_session_id";

// docs/roadmap/engineering-roadmap.md item 25: practice attempts need something to attach to when
// nobody is signed in, so results survive a refresh instead of living only in React state. A
// random id persisted in localStorage — matching `attempts.sessionId` /
// `practiceSessions.sessionId` — lets anonymous practice accumulate and, per the item's notes,
// be claimable later once the same browser signs in.
export function getAnonymousSessionId(): string {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const id = crypto.randomUUID();
  window.localStorage.setItem(STORAGE_KEY, id);
  return id;
}
