// F1_SPORT_ID/F1_COMPETITION/slugify/buildSeasonId/buildDriverId/
// yearFromSeasonId come from @sports/providers-f1-shared — see that
// package's doc comment for why they're shared rather than duplicated here
// (docs/CONTEXT.md, Checkpoint 6 §2/§4).
import { buildTeamId as buildTeamIdFromSlug } from "@sports/providers-f1-shared";

export {
  F1_COMPETITION,
  F1_SPORT_ID,
  buildDriverId,
  buildSeasonId,
  slugify,
  yearFromSeasonId,
} from "@sports/providers-f1-shared";

/** Jolpica gives a resolved constructorId, mapped to our canonical slug via constructorMapping.ts — apply the shared `f1-team-{slug}` format the same way OpenF1's buildTeamId does. */
export const buildTeamId = (canonicalSlug: string): string => buildTeamIdFromSlug(canonicalSlug);

/**
 * Jolpica has no numeric meeting/session key the way OpenF1 does — a race is
 * identified only by (season, round). These ids are Jolpica-scoped and
 * intentionally do NOT match OpenF1's `f1-meeting-{key}`/`f1-session-{key}`
 * ids for the same real-world race: application code never needs them to
 * (OpenF1 remains the sole fixture/session/live-data source — this
 * adapter's `getFixtures`/`getSessions` exist for `SportsProvider` interface
 * completeness and contract-test coverage, not for production use — see
 * docs/CONTEXT.md Checkpoint 6 §4 "Provider decision").
 */
export const buildFixtureId = (year: number, round: string): string => `f1-jolpica-race-${year}-${round}`;
export const buildSessionId = (year: number, round: string, sessionType: string): string =>
  `f1-jolpica-session-${year}-${round}-${sessionType}`;
export const buildVenueId = (circuitId: string): string => `f1-jolpica-circuit-${circuitId}`;

export function fixtureRefFromId(fixtureId: string): { year: number; round: string } {
  const match = /^f1-jolpica-race-(\d+)-(\d+)$/.exec(fixtureId);
  if (!match) {
    throw new Error(`Not a Jolpica fixture id: "${fixtureId}"`);
  }
  return { year: Number(match[1]), round: match[2] };
}
