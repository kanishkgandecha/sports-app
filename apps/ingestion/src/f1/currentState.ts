import type { LiveEvent, f1 } from "@sports/domain";
import type { DriverTimingPatch } from "@sports/providers-f1-openf1";

/**
 * Deliberately derived from the *normalized* `LiveEvent` (domain-typed),
 * never from raw OpenF1 response shapes — ingestion must not know
 * provider-specific types, same provider-boundary rule Checkpoint 3
 * established for the adapter itself (docs/CONTEXT.md §9 "Architecture").
 * The OpenF1 adapter's own `toRaceControlMessageRow` (operating on raw
 * `OpenF1RaceControlMessage`) stays internal to that package for its own
 * tests — this is the ingestion-side equivalent, working from what
 * `pollLiveEvents` actually hands back.
 *
 * Reuses the LiveEvent's own `id` as the row's id — the same deterministic
 * identity Checkpoint 3 built for idempotent LiveEvent creation applies
 * unchanged here, so no new identity model or schema change was needed for
 * current-state idempotency either (docs/CONTEXT.md §9 "Idempotency").
 */
export interface RaceControlMessageRow {
  id: string;
  sessionId: string;
  timestamp: string;
  category: f1.RaceControlCategory;
  message: string;
}

// `as unknown as f1.XPayload` below is the same LiveEvent<T> generic-
// variance limitation documented in packages/providers/f1/openf1's
// normalize/raceControl.ts (Checkpoint 3) — `event.payload` is typed
// `Record<string, unknown>` since `event: LiveEvent` uses the default
// generic; the actual runtime shape is guaranteed by `event.eventType`,
// checked immediately before each cast.
export function toRaceControlMessageRow(event: LiveEvent): RaceControlMessageRow | null {
  if (event.eventType === "SAFETY_CAR") {
    const payload = event.payload as unknown as f1.SafetyCarPayload;
    return {
      id: event.id,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      category: payload.category,
      message: payload.message,
    };
  }

  if (event.eventType === "FLAG") {
    const payload = event.payload as unknown as f1.FlagPayload;
    return {
      id: event.id,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      category: "flag",
      message: payload.message,
    };
  }

  if (event.eventType === "SESSION_STATUS") {
    const payload = event.payload as unknown as f1.SessionStatusPayload;
    return {
      id: event.id,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      category: "message",
      message: payload.message,
    };
  }

  if (event.eventType === "RACE_CONTROL_MESSAGE") {
    const payload = event.payload as unknown as f1.RaceControlMessagePayload;
    return {
      id: event.id,
      sessionId: event.sessionId,
      timestamp: event.timestamp,
      category: "message",
      message: payload.message,
    };
  }

  return null;
}

export interface PitStopRow {
  id: string;
  sessionId: string;
  driverId: string;
  lap: number;
  durationMs: number;
  timestamp: string;
}

export function toPitStopRow(event: LiveEvent): PitStopRow | null {
  if (event.eventType !== "PIT_STOP") return null;
  const payload = event.payload as unknown as f1.PitStopPayload;
  return {
    id: event.id,
    sessionId: event.sessionId,
    driverId: payload.driverId,
    lap: payload.lap,
    durationMs: payload.durationMs,
    timestamp: event.timestamp,
  };
}

/**
 * `getDriverTimingPatches` returns one partial patch per source
 * (position/laps/intervals/stints) — multiple patches can target the same
 * (sessionId, driverId) in one poll tick. Merging them here means one
 * upsert per driver per tick, not up to four, and solves the "can't create
 * a row without `position`" problem naturally by combining whatever arrived
 * this tick before writing (see docs/CONTEXT.md §9 "Current state").
 */
export function mergeDriverTimingPatches(patches: DriverTimingPatch[]): DriverTimingPatch[] {
  const merged = new Map<string, DriverTimingPatch>();
  for (const patch of patches) {
    const key = `${patch.sessionId}:${patch.driverId}`;
    merged.set(key, { ...merged.get(key), ...patch });
  }
  return [...merged.values()];
}
