/**
 * Raw OpenF1 response shapes — verified against real responses from
 * https://api.openf1.org/v1 (see docs/CONTEXT.md §8 for the sessions
 * queried). These types exist ONLY inside this package. Nothing outside
 * `packages/providers/f1/openf1` may import from this file — see
 * ARCHITECTURE.md's provider boundary rule. `adapter.ts` normalizes every
 * one of these into `@sports/domain` types before anything else sees them.
 *
 * Every field below was observed in a real response, not copied from
 * documentation prose alone. Where a field can legitimately be absent, it's
 * typed as `| null` based on what was actually observed (e.g. `pit.
 * stop_duration` was null in every real pit-stop response checked).
 */

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  year: number;
  country_name: string;
  country_code: string;
  circuit_key: number;
  circuit_short_name: string;
  location: string;
  date_start: string;
  date_end: string;
  /** UTC offset, e.g. "02:00:00" — not an IANA zone, but accurate for the race weekend. */
  gmt_offset: string;
  is_cancelled: boolean;
}

export interface OpenF1Session {
  session_key: number;
  meeting_key: number;
  /** Coarse: "Practice" | "Qualifying" | "Sprint" | "Sprint Qualifying" | "Race" */
  session_type: string;
  /** Finer: "Practice 1" | "Practice 2" | "Practice 3" | "Qualifying" | "Sprint" | "Sprint Qualifying" | "Race" — this, not session_type, is what distinguishes FP1/FP2/FP3 */
  session_name: string;
  date_start: string;
  date_end: string;
  gmt_offset: string;
  circuit_key: number;
  circuit_short_name: string;
  country_name: string;
  year: number;
  is_cancelled: boolean;
}

export interface OpenF1Driver {
  driver_number: number;
  session_key: number;
  meeting_key: number;
  broadcast_name: string;
  full_name: string;
  first_name: string;
  last_name: string;
  name_acronym: string;
  /** Hex without a leading "#", e.g. "3671C6". */
  team_colour: string | null;
  team_name: string;
  headshot_url: string | null;
  /** Deprecated by OpenF1, scheduled for removal at the end of the 2026 season. */
  country_code: string | null;
}

export interface OpenF1Lap {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  lap_duration: number | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  i1_speed: number | null;
  i2_speed: number | null;
  st_speed: number | null;
  is_pit_out_lap: boolean;
  // segments_sector_* (mini-sector color codes) deliberately not modeled — see
  // docs/CONTEXT.md §7.7. Present in real responses but no product surface needs them.
}

export interface OpenF1Position {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  position: number;
}

export interface OpenF1Interval {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  /** Number of seconds, OR the literal string "+N LAP(S)" if lapped. Mixed type at the source. */
  gap_to_leader: number | string | null;
  interval: number | string | null;
}

export interface OpenF1Pit {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  lap_number: number;
  /**
   * Verified equal to `lane_duration` in every real sample checked (0/34 rows
   * differed across a full race). Treat as the same "time in the pit lane"
   * metric — see docs/CONTEXT.md §8's pit-duration verification note.
   */
  pit_duration: number | null;
  lane_duration: number | null;
  /** Observed null in every real sample checked, across two full races and a practice session. */
  stop_duration: number | null;
}

export interface OpenF1Stint {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number;
  lap_end: number | null;
  compound: string;
  tyre_age_at_start: number;
}

/**
 * `category` values observed in real data: "SessionStatus", "Flag",
 * "SafetyCar", "Drs", "CarEvent", "Other". Do not assume this list is
 * exhaustive — treat any unrecognized category as the generic fallback.
 * Critically: Red Flag is `category="Flag", flag="RED"`, NOT
 * `category="SafetyCar"` and NOT `category="SessionStatus"` — verified
 * directly against the 2023 Australian GP (session_key 7787), which had two
 * genuine red flags. See docs/CONTEXT.md §8 for the full verification note;
 * this corrects a Checkpoint 2 assumption that was based on doc prose alone.
 */
export interface OpenF1RaceControlMessage {
  session_key: number;
  meeting_key: number;
  date: string;
  category: string;
  /** Populated for category="Flag": "GREEN" | "YELLOW" | "DOUBLE YELLOW" | "CLEAR" | "RED" | "CHEQUERED" | "BLACK AND WHITE". Null otherwise. */
  flag: string | null;
  message: string;
  /**
   * Frequently null even when `message` references a specific car (e.g.
   * message="TURN 5 INCIDENT INVOLVING CAR 23 (ALB)..." had driver_number:
   * null in a real response). Do not rely on this field being populated —
   * `message` is the more complete source for driver-specific context.
   */
  driver_number: number | null;
  lap_number: number | null;
  scope: string | null;
  sector: number | null;
  qualifying_phase: number | null;
}

export interface OpenF1SessionResult {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  position: number | null;
  number_of_laps: number;
  /** Present on Race sessions — points earned in this specific session, not season total. */
  points: number | null;
  dnf: boolean;
  dns: boolean;
  dsq: boolean;
  /** Best lap time (practice/qualifying) or total race time in seconds (races). */
  duration: number | null;
  /** Numeric seconds, or "+N LAP(S)" string, or literal 0 for the session leader. */
  gap_to_leader: number | string | null;
}

/**
 * Beta endpoints. As of this checkpoint's verification (Aug 2026), both
 * `drivers_championship` and `teams_championship` returned HTTP 404
 * ("No results found.") for every query tried — a fully populated meeting_key
 * from the current season, the final 2025 race, and an unfiltered request.
 * These types are written from documentation field names, not a verified
 * real response — see docs/CONTEXT.md §8's standings note. Handled
 * defensively: `OpenF1Adapter.getStandings()` treats "no data" as an empty
 * array, not an error, and this is expected to be the common case right now.
 */
export interface OpenF1ChampionshipEntry {
  session_key: number;
  meeting_key: number;
  points_current: number;
  points_start: number;
  position_current: number;
  position_start: number;
  /** Present on drivers_championship only. */
  driver_number?: number;
  /** Present on teams_championship only. */
  team_name?: string;
}
