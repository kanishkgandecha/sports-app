import type { Competition } from "@sports/domain";

export const F1_SPORT_ID = "f1";

/**
 * There is only ever one Formula 1 World Championship — OpenF1 has no
 * "competition" concept at all (nor does Jolpica-F1). This is a constant the
 * adapter constructs, not something fetched — the same pattern
 * `FakeSportsProvider` already uses for its synthetic competition.
 */
export const F1_COMPETITION: Competition = {
  id: "f1-world-championship",
  sportId: F1_SPORT_ID,
  slug: "f1-world-championship",
  name: "FIA Formula One World Championship",
  type: "championship",
};

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const buildSeasonId = (year: number): string => `f1-season-${year}`;
export const buildFixtureId = (meetingKey: number): string => `f1-meeting-${meetingKey}`;
export const buildSessionId = (sessionKey: number): string => `f1-session-${sessionKey}`;
export const buildVenueId = (circuitKey: number): string => `f1-circuit-${circuitKey}`;
export const buildDriverId = (driverNumber: number): string => `f1-driver-${driverNumber}`;
export const buildTeamId = (teamName: string): string => `f1-team-${slugify(teamName)}`;

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

export function yearFromSeasonId(seasonId: string): number {
  const year = Number(seasonId.replace("f1-season-", ""));
  if (Number.isNaN(year)) {
    throw new Error(`Not an OpenF1 season id: "${seasonId}"`);
  }
  return year;
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
