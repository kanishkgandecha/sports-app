// F1_SPORT_ID/F1_COMPETITION/slugify/buildSeasonId/buildDriverId/
// yearFromSeasonId moved to @sports/providers-f1-shared at Checkpoint 6 —
// building the Jolpica adapter needed the exact same driver-id and season-id
// conventions (verified: Jolpica's `permanentNumber` resolves to the same
// `f1-driver-{number}` ids this package already builds). Re-exported here
// so nothing else in this package needed an import-path change.
import {
  F1_SPORT_ID,
  F1_COMPETITION,
  slugify,
  buildSeasonId,
  buildDriverId,
  yearFromSeasonId,
  buildTeamId as buildTeamIdFromSlug,
} from "@sports/providers-f1-shared";

export { F1_SPORT_ID, F1_COMPETITION, slugify, buildSeasonId, buildDriverId, yearFromSeasonId };

export const buildFixtureId = (meetingKey: number): string => `f1-meeting-${meetingKey}`;
export const buildSessionId = (sessionKey: number): string => `f1-session-${sessionKey}`;
export const buildVenueId = (circuitKey: number): string => `f1-circuit-${circuitKey}`;
/** OpenF1 gives a team_name, not a pre-resolved slug — slugify it here, then apply the shared `f1-team-{slug}` format. */
export const buildTeamId = (teamName: string): string => buildTeamIdFromSlug(slugify(teamName));

/** Reverses buildFixtureId/buildSessionId — needed because the SportsProvider
 * interface passes our ids back in (getSessions({fixtureId}), etc.), not
 * OpenF1's raw numeric keys. */
export function meetingKeyFromFixtureId(fixtureId: string): number {
  const key = Number(fixtureId.replace("f1-meeting-", ""));
  if (Number.isNaN(key)) {
    throw new Error(`Not an OpenF1 fixture id: "${fixtureId}"`);
  }
  return key;
}

export function sessionKeyFromSessionId(sessionId: string): number {
  const key = Number(sessionId.replace("f1-session-", ""));
  if (Number.isNaN(key)) {
    throw new Error(`Not an OpenF1 session id: "${sessionId}"`);
  }
  return key;
}

/**
 * OpenF1's `race_control` rows have no natural unique key beyond `date`
 * (which two messages can share, e.g. a flag and its immediate clear).
 * Deterministic djb2-style hash so the same input always produces the same
 * LiveEvent id (idempotent re-ingestion) without needing external counter
 * state in a pure normalization function.
 */
export function deterministicHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
