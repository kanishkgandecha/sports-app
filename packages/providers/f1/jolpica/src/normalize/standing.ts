import type { Standing } from "@sports/domain";
import type { JolpicaConstructorStanding, JolpicaDriverStanding } from "../types";
import { buildDriverId, buildSeasonId, buildTeamId } from "../reference";
import { resolveTeamSlug } from "../constructorMapping";

/**
 * Jolpica-F1 is the primary `Standing` source (OpenF1's own championship
 * endpoints are beta and returned no data for any query tried — see
 * `packages/providers/f1/openf1/src/normalize/standing.ts`'s doc comment
 * and docs/CONTEXT.md Checkpoint 3/6). All fields read here (`position`,
 * `points`, `wins`, `Driver.permanentNumber`, `Constructors[0]
 * .constructorId`) were verified present on every entry of a real
 * `/2026/driverstandings/` response — see fixtures/driverStandings.2026.json
 * and docs/CONTEXT.md Checkpoint 6 §1.
 *
 * `permanentNumber` can legitimately be absent for some historical drivers
 * (pre-2014 seasons didn't have permanent numbers) — handled explicitly
 * rather than assumed present, even though every driver in a *current*
 * standings response has one.
 */
export function normalizeDriverStanding(
  entry: JolpicaDriverStanding,
  input: { competitionId: string; year: number },
): Standing | undefined {
  if (!entry.Driver.permanentNumber) {
    console.warn(
      `[jolpica] Driver "${entry.Driver.driverId}" has no permanentNumber — cannot map to a Player id, skipping this standings row.`,
    );
    return undefined;
  }
  const driverNumber = Number(entry.Driver.permanentNumber);
  if (Number.isNaN(driverNumber)) {
    console.warn(
      `[jolpica] Driver "${entry.Driver.driverId}" has a non-numeric permanentNumber "${entry.Driver.permanentNumber}" — skipping this standings row.`,
    );
    return undefined;
  }

  const seasonId = buildSeasonId(input.year);
  const entityId = buildDriverId(driverNumber);
  const primaryConstructor = entry.Constructors[entry.Constructors.length - 1];

  return {
    id: `jolpica-standing-${input.year}-driver-${entityId}`,
    competitionId: input.competitionId,
    seasonId,
    entityType: "player",
    entityId,
    points: Number(entry.points),
    position: Number(entry.position),
    extra: {
      wins: Number(entry.wins),
      driverCode: entry.Driver.code ?? null,
      // A driver can change teams mid-season; Jolpica lists every
      // constructor they scored points for that season, most recent last.
      // We surface the current one as `teamId` for display, and the full
      // history for anything that wants it.
      teamId: primaryConstructor ? buildTeamId(resolveTeamSlug(primaryConstructor.constructorId)) : null,
      constructorHistory: entry.Constructors.map((c) => buildTeamId(resolveTeamSlug(c.constructorId))),
    },
  };
}

export function normalizeConstructorStanding(
  entry: JolpicaConstructorStanding,
  input: { competitionId: string; year: number },
): Standing {
  const seasonId = buildSeasonId(input.year);
  const entityId = buildTeamId(resolveTeamSlug(entry.Constructor.constructorId));

  return {
    id: `jolpica-standing-${input.year}-constructor-${entityId}`,
    competitionId: input.competitionId,
    seasonId,
    entityType: "team",
    entityId,
    points: Number(entry.points),
    position: Number(entry.position),
    extra: {
      wins: Number(entry.wins),
      jolpicaConstructorId: entry.Constructor.constructorId,
    },
  };
}
