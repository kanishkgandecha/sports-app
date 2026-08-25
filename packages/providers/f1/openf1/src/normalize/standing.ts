import type { Standing, StandingEntityType } from "@sports/domain";
import type { OpenF1ChampionshipEntry } from "../types";
import { buildDriverId, buildTeamId } from "../reference";

/**
 * Best-effort only — see docs/CONTEXT.md §7.3.6 and §8. `drivers_championship`
 * /`teams_championship` are marked "(beta)" by OpenF1 and, as verified at
 * this checkpoint, currently return no data for any query tried (a fully
 * populated meeting, the final 2025 race, and an unfiltered request all
 * returned HTTP 404 "No results found"). Jolpica-F1 is the intended primary
 * `Standing` source (not implemented this checkpoint — see §8's "Jolpica
 * boundary" note). This function exists so the shape is correct and tested
 * against documented field names, ready for whenever OpenF1's beta endpoint
 * starts returning real data, or as a secondary source once it's proven.
 */
export function normalizeChampionshipEntry(
  entry: OpenF1ChampionshipEntry,
  input: { competitionId: string; seasonId: string },
): Standing {
  const entityType: StandingEntityType = entry.driver_number !== undefined ? "player" : "team";
  const entityId =
    entry.driver_number !== undefined ? buildDriverId(entry.driver_number) : buildTeamId(entry.team_name ?? "unknown");

  return {
    id: `openf1-standing-${entry.session_key}-${entityType}-${entityId}`,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    entityType,
    entityId,
    points: entry.points_current,
    position: entry.position_current,
    extra: {
      pointsStart: entry.points_start,
      positionStart: entry.position_start,
      meetingKey: entry.meeting_key,
    },
  };
}
