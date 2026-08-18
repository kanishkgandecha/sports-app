import type { Competition, Season } from "@sports/domain";
import type { CricketDataSeriesInfo } from "../types";
import { CRICKET_SPORT_ID, buildCompetitionId, buildSeasonId, slugify } from "../reference";

export function normalizeCompetition(series: CricketDataSeriesInfo): Competition {
  return {
    id: buildCompetitionId(series.id),
    sportId: CRICKET_SPORT_ID,
    slug: slugify(series.name),
    name: series.name,
    type: "tournament",
  };
}

/**
 * `startdate` verified real ISO format ("2026-08-04") on most series — but
 * verified genuinely UNDEFINED on at least one real series encountered
 * during this checkpoint's live smoke test (a real `TypeError` this
 * function crashed with the first time it ran against live data, not a
 * hypothetical). `enddate` separately verified NOT always ISO either — a
 * real series had `enddate: "Aug 28"` (no year, no dashes), and the naive
 * fix (checking `Number.isNaN(new Date(enddate).getTime())`) turned out to
 * be actively wrong: `new Date("Aug 28")` does NOT fail, it silently
 * parses to **2001-08-28** (JS's month-day-only date parsing defaults to
 * year 2001) — worse than an exception, a wrong date that would have
 * reached Postgres looking valid.
 *
 * Both gaps are handled the same way `JolpicaAdapter.getSeasons` already
 * established for exactly this situation (an incomplete date range from a
 * real provider — see docs/CONTEXT.md, Checkpoint 6 §10): fall back to
 * `{year}-01-01`/`{year}-12-31`, using the year embedded in the series
 * name (verified always present) — an honest approximation, not a crash,
 * and not silently wrong the way the naive `enddate` parse was.
 */
export function normalizeSeason(series: CricketDataSeriesInfo, input: { competitionId: string }): Season {
  const nameYear = extractYear(series.name);
  const fallbackYear = nameYear ?? (series.startdate ? series.startdate.slice(0, 4) : String(new Date().getFullYear()));

  const start = series.startdate ?? `${fallbackYear}-01-01`;
  const startYear = Number(start.slice(0, 4));

  const parsedEnd = series.enddate ? new Date(series.enddate) : undefined;
  const parsedEndYear = parsedEnd?.getFullYear();
  const endYearIsSane = parsedEnd && !Number.isNaN(parsedEnd.getTime()) && parsedEndYear !== undefined && Math.abs(parsedEndYear - startYear) <= 1;
  const end = endYearIsSane ? series.enddate! : `${fallbackYear}-12-31`;

  return {
    id: buildSeasonId(series.id),
    competitionId: input.competitionId,
    label: nameYear ?? start.slice(0, 4),
    startDate: start,
    endDate: end,
  };
}

/** Series names verified to always include the year (e.g. "Tamil Nadu Premier League 2026") — preferred over `startdate`'s year since a series that starts in December and ends in January of the next year is still "labeled" by its own name, not its start date. */
function extractYear(name: string): string | null {
  const match = /\b(20\d{2})\b/.exec(name);
  return match ? match[1] : null;
}
