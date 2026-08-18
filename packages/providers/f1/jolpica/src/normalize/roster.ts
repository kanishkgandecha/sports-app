import type { Player, Team } from "@sports/domain";
import type { JolpicaConstructorStanding, JolpicaDriverStanding } from "../types";
import { F1_SPORT_ID, buildDriverId, buildTeamId } from "../reference";
import { resolveTeamSlug } from "../constructorMapping";

/**
 * Roster approximation from the standings response — the same spirit as
 * OpenF1Adapter's "closest session" roster approximation
 * (packages/providers/f1/openf1/src/adapter.ts's class doc comment):
 * Jolpica has no dedicated "current roster" endpoint either, but every
 * driver who has scored a point this season appears in the standings
 * response, which is a reasonable proxy. Not used by ingestion (OpenF1
 * remains the roster source of truth) — exists for `SportsProvider`
 * interface completeness and contract-test coverage, see adapter.ts.
 */
export function normalizeTeamFromStanding(entry: JolpicaConstructorStanding): Team {
  return {
    id: buildTeamId(resolveTeamSlug(entry.Constructor.constructorId)),
    sportId: F1_SPORT_ID,
    name: entry.Constructor.name,
    slug: resolveTeamSlug(entry.Constructor.constructorId),
    country: entry.Constructor.nationality,
    // Jolpica doesn't expose brand color (OpenF1 does, via team_colour) —
    // honestly represented as unknown rather than guessed.
    colorHex: null,
  };
}

export function normalizePlayerFromStanding(entry: JolpicaDriverStanding): Player | undefined {
  if (!entry.Driver.permanentNumber) return undefined;
  const driverNumber = Number(entry.Driver.permanentNumber);
  if (Number.isNaN(driverNumber)) return undefined;

  const primaryConstructor = entry.Constructors[entry.Constructors.length - 1];
  return {
    id: buildDriverId(driverNumber),
    sportId: F1_SPORT_ID,
    teamId: primaryConstructor ? buildTeamId(resolveTeamSlug(primaryConstructor.constructorId)) : null,
    name: `${entry.Driver.givenName} ${entry.Driver.familyName}`,
    role: null,
    shortName: entry.Driver.code ?? null,
    avatarUrl: null,
  };
}
