import type { Competition } from "@sports/domain";

/**
 * Extracted at Checkpoint 6 from `packages/providers/f1/openf1` — building
 * the Jolpica adapter surfaced that some of what looked like "OpenF1
 * internals" are actually F1-domain-level facts every F1 provider must
 * agree on for cross-provider joins to work: there's one championship
 * (`F1_COMPETITION`), a season is just its year, and — critically — a
 * driver's car number is a real FIA-assigned identifier both OpenF1 and
 * Jolpica report identically (verified: Jolpica's `permanentNumber` field
 * resolved directly to real `f1-driver-{number}` Player rows OpenF1's
 * adapter had already created — see docs/CONTEXT.md, Checkpoint 6).
 *
 * `buildFixtureId`/`buildSessionId`/`buildVenueId` (keyed off OpenF1's own
 * numeric `meeting_key`/`session_key`/`circuit_key`) are NOT here — those
 * are genuinely OpenF1-specific and stay in that package. Team identity is
 * also NOT a shared id-builder here: unlike driver numbers, there's no
 * universal constructor identifier either provider agrees on by
 * construction (OpenF1 give a `team_name`, Jolpica gives a different
 * `constructorId` slug for the *same* team in at least 4 of 11 cases this
 * checkpoint found) — each provider resolves its own canonical slug first
 * (Jolpica's via an explicit mapping table, since there's no formula that
 * derives one from the other), then calls the shared `buildTeamId(slug)`
 * just to apply the common `f1-team-{slug}` format consistently.
 */
export const F1_SPORT_ID = "f1";

/** There is only ever one Formula 1 World Championship — neither OpenF1 nor Jolpica has a "competition" concept; this is a constant every F1 adapter constructs, not something fetched. */
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
/** Real, FIA-assigned car number — the one identifier both OpenF1 and Jolpica report identically for the same driver. */
export const buildDriverId = (driverNumber: number): string => `f1-driver-${driverNumber}`;
/** Takes an already-resolved canonical slug — see the module doc comment on why team-name resolution itself isn't shared. */
export const buildTeamId = (canonicalSlug: string): string => `f1-team-${canonicalSlug}`;

export function yearFromSeasonId(seasonId: string): number {
  const year = Number(seasonId.replace("f1-season-", ""));
  if (Number.isNaN(year)) {
    throw new Error(`Not an F1 season id: "${seasonId}"`);
  }
  return year;
}
