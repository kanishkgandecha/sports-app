/**
 * Id-building / reference constants for the CricketData.org adapter.
 *
 * Unlike F1 (one fixed `F1_COMPETITION` every provider agrees on), cricket
 * has no single championship — a "series" (e.g. "Tamil Nadu Premier League
 * 2026", confirmed real via `series_info`) IS the Competition, and each
 * series gets exactly one Season representing its own run. No shared
 * `packages/providers/cricket/shared` package was extracted the way F1 got
 * one at Checkpoint 6 — that extraction was driven by a real, confirmed
 * need (two F1 providers had to agree on identical driver/season ids for
 * cross-provider joins to work). Cricket has exactly one provider this
 * checkpoint; extracting a shared package now would be speculative
 * infrastructure for a second provider that doesn't exist yet. Revisit
 * if/when Sportmonks Cricket (the approved production provider) is
 * actually added and needs to agree on the same team/player identity.
 */

export const CRICKET_SPORT_ID = "cricket";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/** A series IS the Competition — see this module's doc comment. */
export const buildCompetitionId = (seriesId: string): string => `cricket-series-${seriesId}`;
/** One Season per series/Competition — there is no broader "season" a series belongs to that CricketData.org exposes. */
export const buildSeasonId = (seriesId: string): string => `cricket-series-season-${seriesId}`;
export const buildFixtureId = (matchId: string): string => `cricket-match-${matchId}`;
/** `innings` is 1-based (1st, 2nd, 3rd, 4th) — matches `CricketSessionType`'s ordering in `@sports/domain`. */
export const buildSessionId = (matchId: string, innings: number): string => `cricket-match-${matchId}-innings-${innings}`;
/** CricketData.org gives a real, stable per-team identity only via `teamInfo[].name` (no team id field observed) — slugified, matching every other sport's `buildTeamId(name)` pattern (e.g. OpenF1Adapter's). */
export const buildTeamId = (teamName: string): string => `cricket-team-${slugify(teamName)}`;
/** CricketData.org gives a real, stable UUID per player (`batsman.id`/`bowler.id`/`catcher.id` in `match_scorecard` — verified identical across every reference to the same real player) — used directly, no slugify needed. */
export const buildPlayerId = (providerPlayerId: string): string => `cricket-player-${providerPlayerId}`;
/** No venue id from the provider, only a free-text name (e.g. "MA Chidambaram Stadium, Chennai") — slugified like team names. */
export const buildVenueId = (venueName: string): string => `cricket-venue-${slugify(venueName)}`;

/**
 * `[0-9a-f-]+` (a UUID character class), not `.+` — real match ids are
 * UUIDs (e.g. "e9d200fb-3c43-4852-9c93-9160517d7b36"), and session ids
 * share the `cricket-match-{matchId}-innings-N` prefix, so a greedy `.+`
 * here would silently accept a session id and return the wrong thing
 * (`"{matchId}-innings-N"` as if it were the match id). "innings" contains
 * letters outside `[0-9a-f]`, so this class can never match past the real
 * UUID.
 */
export function fixtureRefFromId(fixtureId: string): string {
  const match = /^cricket-match-([0-9a-f-]+)$/.exec(fixtureId);
  if (!match) {
    throw new Error(`Not a CricketData fixture id: "${fixtureId}"`);
  }
  return match[1];
}

export function sessionRefFromId(sessionId: string): { matchId: string; innings: number } {
  const match = /^cricket-match-(.+)-innings-(\d+)$/.exec(sessionId);
  if (!match) {
    throw new Error(`Not a CricketData session id: "${sessionId}"`);
  }
  return { matchId: match[1], innings: Number(match[2]) };
}
