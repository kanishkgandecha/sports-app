/**
 * Cricket Checkpoint 3 — extracted after `formatDate` turned out to be
 * copy-pasted identically across `app/page.tsx`, `app/sports/f1/page.tsx`,
 * and (about to be) `app/sports/cricket/page.tsx` (a real review finding,
 * not speculative — three byte-identical function bodies). Small, pure,
 * sport-agnostic — the same kind of extraction `Countdown`/`GlossaryDrawer`
 * /`StateView` already went through once a second real consumer existed.
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Same idea, with a time-of-day — Cricket's fixture lists show start time, not just date (F1's don't need to; a session's exact kickoff time is less load-bearing than "which day of the race weekend"). */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "Name, Country" when a country is known, else just the name — never a dangling ", " (the one real bug class this guards against; see docs/CONTEXT.md's Cricket Checkpoint 3 section). */
export function venueLine(venue: { name: string; country: string | null } | null): string | null {
  if (!venue) return null;
  return venue.country ? `${venue.name}, ${venue.country}` : venue.name;
}
