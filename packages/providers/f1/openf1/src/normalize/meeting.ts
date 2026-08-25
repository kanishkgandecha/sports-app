import type { Fixture, FixtureStatus, Venue } from "@sports/domain";
import type { OpenF1Meeting } from "../types";
import { F1_SPORT_ID, buildFixtureId, buildVenueId, slugify } from "../reference";

/**
 * Derives a UTC-offset string like "+02:00" from OpenF1's `gmt_offset`
 * ("02:00:00"). This supersedes the Checkpoint 2 proposal to maintain a
 * static circuit→timezone lookup table inside the adapter — real responses
 * showed OpenF1 already provides this per meeting, which is simpler and
 * needs no manual maintenance. See docs/CONTEXT.md §8 for the corrected
 * decision (§7.4.1 is marked SUPERSEDED there, not deleted).
 */
export function deriveUtcOffset(gmtOffset: string): string {
  const [hours] = gmtOffset.split(":");
  const sign = hours.startsWith("-") ? "-" : "+";
  const paddedHours = hours.replace("-", "").padStart(2, "0");
  const minutes = gmtOffset.split(":")[1] ?? "00";
  return `${sign}${paddedHours}:${minutes}`;
}

export function normalizeVenue(meeting: OpenF1Meeting): Venue {
  return {
    id: buildVenueId(meeting.circuit_key),
    name: meeting.circuit_short_name,
    country: meeting.country_name,
    timezone: deriveUtcOffset(meeting.gmt_offset),
  };
}

export function deriveFixtureStatus(meeting: OpenF1Meeting, now: Date): FixtureStatus {
  if (meeting.is_cancelled) return "cancelled";
  const start = new Date(meeting.date_start);
  const end = new Date(meeting.date_end);
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "live";
}

export function normalizeMeeting(
  meeting: OpenF1Meeting,
  input: { competitionId: string; seasonId: string; now?: Date },
): Fixture {
  return {
    id: buildFixtureId(meeting.meeting_key),
    sportId: F1_SPORT_ID,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    // meeting_key suffix, not just name+year: real 2026 data has two
    // "Pre-Season Testing" meetings and two "Bahrain Grand Prix" meetings
    // (different meeting_key each) — meeting_name is not unique within a
    // year. Found via a live smoke test at Checkpoint 4 (a Fixture_sportId
    // _slug unique-constraint violation during bootstrap), not documentation
    // — see docs/CONTEXT.md §9. Slightly less pretty as a URL slug; correct
    // by construction instead of "usually correct."
    slug: `${slugify(meeting.meeting_name)}-${meeting.year}-${meeting.meeting_key}`,
    name: meeting.meeting_name,
    status: deriveFixtureStatus(meeting, input.now ?? new Date()),
    startTime: meeting.date_start,
    venueId: buildVenueId(meeting.circuit_key),
  };
}
