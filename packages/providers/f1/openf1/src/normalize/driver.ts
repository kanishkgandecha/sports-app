import type { Player, Team } from "@sports/domain";
import type { OpenF1Driver } from "../types";
import { F1_SPORT_ID, buildDriverId, buildTeamId, slugify } from "../reference";

/**
 * OpenF1 has no dedicated teams/constructors endpoint — team identity only
 * exists embedded in `drivers` responses (verified: no such endpoint exists
 * in the `br-g/openf1` repo or docs). `team_name` is the only identifier,
 * with no stable numeric id, so it's slugified. Sponsor-name changes
 * mid-season are a known, accepted gap (Checkpoint 2 §7.3) — not solved here.
 */
export function normalizeTeam(driver: OpenF1Driver): Team {
  return {
    id: buildTeamId(driver.team_name),
    sportId: F1_SPORT_ID,
    name: driver.team_name,
    slug: slugify(driver.team_name),
    country: null,
    colorHex: driver.team_colour ? `#${driver.team_colour}` : null,
  };
}

/**
 * Identity risk (documented, not solved): `driver_number` is the only
 * practical correlation key OpenF1 gives us. It's career-stable in normal
 * circumstances but not contractually guaranteed — a reserve driver
 * substitution could reuse or change a number mid-season. Checkpoint 2 §7.6.
 */
export function normalizePlayer(driver: OpenF1Driver): Player {
  return {
    id: buildDriverId(driver.driver_number),
    sportId: F1_SPORT_ID,
    teamId: buildTeamId(driver.team_name),
    name: driver.full_name,
    role: "driver",
    shortName: driver.name_acronym,
    avatarUrl: driver.headshot_url,
  };
}
