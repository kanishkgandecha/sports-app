import type { Team } from "@sports/domain";
import type { CricketDataMatchSummary } from "../types";
import { CRICKET_SPORT_ID, buildTeamId, slugify } from "../reference";

/**
 * `shortname` verified genuinely absent on at least one real team
 * ("Barbados Tridents" had none) — never fabricated from the full name.
 * No brand color exists in this provider's data at all (unlike OpenF1's
 * `team_colour` for F1) — `colorHex` is always `null` here, honestly.
 */
export function normalizeTeams(match: CricketDataMatchSummary): Team[] {
  return match.teamInfo.map((team) => ({
    id: buildTeamId(team.name),
    sportId: CRICKET_SPORT_ID,
    name: team.name,
    slug: slugify(team.name),
    country: null,
    colorHex: null,
  }));
}
