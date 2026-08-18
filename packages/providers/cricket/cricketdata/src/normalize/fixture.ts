import type { Fixture, FixtureStatus, Venue } from "@sports/domain";
import type { cricket } from "@sports/domain";
import type { CricketDataMatchSummary } from "../types";
import { CRICKET_SPORT_ID, buildFixtureId, buildVenueId, slugify } from "../reference";

/**
 * `matchType` verified genuinely absent on some real matches (see
 * types.ts's doc comment). Falls back to scanning the match `name` text
 * for "test"/"odi"/"t20" — a real, disclosed heuristic over provider text
 * the vendor itself writes (match names always name the format in
 * practice, e.g. "...3rd ODI..."), not a fabricated guess. Returns `null`
 * only when neither source has an answer.
 */
export function deriveFormat(match: CricketDataMatchSummary): cricket.CricketFormat | null {
  const fromField = match.matchType?.toLowerCase();
  if (fromField === "test") return "TEST";
  if (fromField === "odi") return "ODI";
  if (fromField === "t20") return "T20";

  const name = match.name.toLowerCase();
  if (/\btest\b/.test(name)) return "TEST";
  if (/\bodi\b/.test(name)) return "ODI";
  if (/\bt20\b/.test(name)) return "T20";
  return null;
}

/**
 * `matchEnded` verified unreliable alone (a real match awarded due to a
 * forfeit had `matchEnded: false` despite being genuinely over — see
 * types.ts's doc comment on `CricketDataMatchSummary.matchEnded`) — the
 * free-text `status` is checked for terminal language too. Order matters:
 * cancelled/abandoned checked before the completed-keyword check, since
 * "no result" (an abandonment outcome) would otherwise also match nothing
 * in the completed list and needs its own branch.
 */
export function deriveFixtureStatus(match: CricketDataMatchSummary): FixtureStatus {
  const status = match.status.toLowerCase();
  if (status.includes("abandon")) return "postponed";
  if (status.includes("cancel")) return "cancelled";

  const completedKeywords = ["won by", "won the", "awarded", "no result", "tied", "drawn", "match drawn"];
  if (match.matchEnded || completedKeywords.some((k) => status.includes(k))) return "completed";
  if (match.matchStarted) return "live";
  return "scheduled";
}

/**
 * No separate country field — verified real: `venue` is one combined
 * free-text string (e.g. "MA Chidambaram Stadium, Chennai"). Splitting on
 * the last comma would often yield a *city*, not a country (as in that
 * example) — mislabeling it as `country` would be worse than being
 * honest that we don't have one. See @sports/domain's `Venue.country` doc
 * comment for why this is nullable at all (the one core-model change this
 * checkpoint made).
 */
export function normalizeVenue(match: CricketDataMatchSummary): Venue {
  return {
    id: buildVenueId(match.venue),
    name: match.venue,
    country: null,
    timezone: "UTC",
  };
}

export function normalizeFixture(
  match: CricketDataMatchSummary,
  input: { competitionId: string; seasonId: string },
): Fixture {
  return {
    id: buildFixtureId(match.id),
    sportId: CRICKET_SPORT_ID,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    slug: `${slugify(match.name)}-${match.id.slice(0, 8)}`,
    name: match.name,
    status: deriveFixtureStatus(match),
    // No separate time field on `date`; `dateTimeGMT` (verified real
    // format "2026-08-18T14:00:00", no timezone suffix) is the real start
    // time — treated as UTC, matching CricketData.org's own field naming
    // ("GMT" in the field name), not independently confirmed against a
    // known-timezone match.
    startTime: `${match.dateTimeGMT}Z`,
    venueId: buildVenueId(match.venue),
  };
}

/** `tossWinner`/`tossChoice` only ever present on `match_info` detail — verified absent on list summaries (§ types.ts). `resolveTeamId` takes the already-slugified team-id builder so this function doesn't need to know about team-id construction itself. */
export function normalizeFixtureDetail(
  match: CricketDataMatchSummary,
  input: { resolveTeamId: (teamName: string) => string },
): cricket.CricketFixtureDetail {
  const tossWinnerName = match.tossWinner
    ? match.teams.find((t) => t.toLowerCase() === match.tossWinner?.toLowerCase())
    : undefined;

  return {
    id: `cricket-fixture-detail-${match.id}`,
    fixtureId: buildFixtureId(match.id),
    format: deriveFormat(match),
    tossWonByTeamId: tossWinnerName ? input.resolveTeamId(tossWinnerName) : null,
    tossDecision: match.tossChoice?.toLowerCase() === "bat" ? "BAT" : match.tossChoice?.toLowerCase() === "bowl" ? "BOWL" : null,
    result: deriveFixtureStatus(match) === "completed" ? match.status : null,
  };
}
