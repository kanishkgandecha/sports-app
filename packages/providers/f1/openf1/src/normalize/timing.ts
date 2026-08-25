import type { LiveEvent, f1 } from "@sports/domain";
import type { OpenF1Interval, OpenF1Lap, OpenF1Pit, OpenF1Position, OpenF1SessionResult, OpenF1Stint } from "../types";
import { F1_SPORT_ID, buildDriverId, buildSessionId } from "../reference";

/** Partial current-state patch — ingestion (Checkpoint 5) upserts these into `DriverTiming`. */
export type DriverTimingPatch = Partial<f1.DriverTiming> & { sessionId: string; driverId: string };

/**
 * OpenF1's `gap_to_leader`/`interval` are mixed-type at the source: numeric
 * seconds, the literal number 0 for the session leader, or a string like
 * "+1 LAP(S)" for a lapped car (see docs/CONTEXT.md §7.4.5's note on why
 * `DriverTiming.gapToLeader`/`intervalToAhead` stay strings, not floats).
 */
export function formatGap(value: number | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value;
  if (value === 0) return "0.000";
  return `+${value.toFixed(3)}`;
}

export function normalizeLap(lap: OpenF1Lap, input: { sessionId?: string }): LiveEvent<f1.LapCompletedPayload> | null {
  // Out-laps and in-progress laps often have no lap_duration yet — a
  // deliberate "no event" rather than fabricating a 0 or null-as-zero time.
  if (lap.lap_duration === null) return null;

  const sessionId = input.sessionId ?? buildSessionId(lap.session_key);
  return {
    id: `openf1-lap-${lap.session_key}-${lap.driver_number}-${lap.lap_number}`,
    sportId: F1_SPORT_ID,
    sessionId,
    eventType: "LAP_COMPLETED",
    timestamp: lap.date_start ?? new Date().toISOString(),
    source: "openf1",
    payload: {
      driverId: buildDriverId(lap.driver_number),
      lap: lap.lap_number,
      lapTime: lap.lap_duration.toFixed(3),
    },
  };
}

export function lapTimingPatch(lap: OpenF1Lap, sessionId: string): DriverTimingPatch {
  return {
    sessionId,
    driverId: buildDriverId(lap.driver_number),
    lastLapTime: lap.lap_duration,
    sector1: lap.duration_sector_1,
    sector2: lap.duration_sector_2,
    sector3: lap.duration_sector_3,
  };
}

/**
 * OpenF1's `position` endpoint streams *current* position over time, not
 * deltas — pure by design: caller (the adapter) tracks previous position per
 * driver and calls this once per new reading. Returns `null` when position
 * hasn't actually changed, so current-state polling doesn't produce a flood
 * of no-op LiveEvents.
 */
export function diffPosition(
  previous: number | undefined,
  current: OpenF1Position,
  input: { sessionId?: string },
): LiveEvent<f1.PositionChangePayload> | null {
  if (previous === undefined || previous === current.position) return null;

  const sessionId = input.sessionId ?? buildSessionId(current.session_key);
  return {
    id: `openf1-position-${current.session_key}-${current.driver_number}-${current.date}`,
    sportId: F1_SPORT_ID,
    sessionId,
    eventType: "POSITION_CHANGE",
    timestamp: current.date,
    source: "openf1",
    payload: {
      driverId: buildDriverId(current.driver_number),
      from: previous,
      to: current.position,
    },
  };
}

/**
 * DriverTiming.position is a required (non-null) field, but neither laps,
 * intervals, nor stints ever supply it — only the `/position` endpoint does.
 * Missing from `getDriverTimingPatches` since Checkpoint 3; found while
 * wiring ingestion's current-state upserts at Checkpoint 4 (docs/CONTEXT.md
 * §9), since a DriverTiming row can't be created without it.
 */
export function positionTimingPatch(position: OpenF1Position, sessionId: string): DriverTimingPatch {
  return {
    sessionId,
    driverId: buildDriverId(position.driver_number),
    position: position.position,
  };
}

/** Final classified position/state from OpenF1's completed-session result endpoint. */
export function sessionResultTimingPatch(result: OpenF1SessionResult, sessionId: string): DriverTimingPatch {
  const gap = Array.isArray(result.gap_to_leader)
    ? ([...result.gap_to_leader].reverse().find((value) => value !== null) ?? null)
    : result.gap_to_leader;
  return {
    sessionId,
    driverId: buildDriverId(result.driver_number),
    position: result.position ?? 0,
    gapToLeader: formatGap(gap),
    state: result.dsq ? "dsq" : result.dns ? "dns" : result.dnf ? "dnf" : "running",
  };
}

export function intervalTimingPatch(interval: OpenF1Interval, sessionId: string): DriverTimingPatch {
  return {
    sessionId,
    driverId: buildDriverId(interval.driver_number),
    gapToLeader: formatGap(interval.gap_to_leader),
    intervalToAhead: formatGap(interval.interval),
  };
}

export function normalizePitStop(pit: OpenF1Pit, input: { sessionId?: string }): LiveEvent<f1.PitStopPayload> | null {
  // Verified against real data (see docs/CONTEXT.md §8): pit_duration and
  // lane_duration are consistently equal when present; stop_duration was
  // null in every sample checked. Prefer pit_duration, fall back to
  // lane_duration, and emit nothing if neither is known yet (e.g. the pit
  // entry has been logged but the exit/duration hasn't been timed yet).
  const durationSeconds = pit.pit_duration ?? pit.lane_duration;
  if (durationSeconds === null) return null;

  const sessionId = input.sessionId ?? buildSessionId(pit.session_key);
  return {
    id: `openf1-pit-${pit.session_key}-${pit.driver_number}-${pit.lap_number}`,
    sportId: F1_SPORT_ID,
    sessionId,
    eventType: "PIT_STOP",
    timestamp: pit.date,
    source: "openf1",
    payload: {
      driverId: buildDriverId(pit.driver_number),
      lap: pit.lap_number,
      durationMs: Math.round(durationSeconds * 1000),
    },
  };
}

export function normalizeStint(stint: OpenF1Stint, sessionId: string): DriverTimingPatch {
  return {
    sessionId,
    driverId: buildDriverId(stint.driver_number),
    tyreCompound: stint.compound as f1.TyreCompound,
  };
}
