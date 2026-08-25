/**
 * F1 extension of the core domain model (ARCHITECTURE.md §5). A driver is a
 * Player, a constructor is a Team; everything below is what's specific to a
 * race weekend.
 */

export type F1SessionType = "FP1" | "FP2" | "FP3" | "QUALIFYING" | "SPRINT_QUALIFYING" | "SPRINT" | "RACE";

export type TyreCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";

export type DriverSessionState = "running" | "out" | "dnf" | "dsq" | "dns";

export interface DriverTiming {
  id: string;
  sessionId: string;
  driverId: string;
  position: number;
  /** Numeric seconds, or literally "+N LAP(S)" if lapped — mixed type at the OpenF1 source, kept as a string. */
  gapToLeader: string | null;
  /** Gap to the car immediately ahead. Same mixed-type reasoning as gapToLeader. */
  intervalToAhead: string | null;
  /** Raw seconds — Phase 0 guessed formatted strings; OpenF1 gives numeric durations. Format at the display layer. */
  lastLapTime: number | null;
  bestLapTime: number | null;
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  tyreCompound: TyreCompound | null;
  state: DriverSessionState;
}

export interface PitStop {
  id: string;
  sessionId: string;
  driverId: string;
  lap: number;
  durationMs: number;
  timestamp: string;
}

export type RaceControlCategory = "flag" | "safety_car" | "vsc" | "red_flag" | "message";

export interface RaceControlMessage {
  id: string;
  sessionId: string;
  timestamp: string;
  category: RaceControlCategory;
  message: string;
}

/**
 * F1 LiveEvent payloads (ARCHITECTURE.md §5 / master brief §11).
 * Each variant is a LiveEvent<T>["payload"] for a given eventType.
 */
export interface LapCompletedPayload {
  driverId: string;
  lap: number;
  lapTime: string;
}

/** Was missing despite PIT_STOP being in F1_EVENT_TYPES since Phase 0 — added while wiring the OpenF1 adapter's pit normalization (Checkpoint 3). */
export interface PitStopPayload {
  driverId: string;
  lap: number;
  durationMs: number;
}

export interface PositionChangePayload {
  driverId: string;
  from: number;
  to: number;
}

export interface FastestLapPayload {
  driverId: string;
  lapTime: string;
  lap: number;
}

export interface SafetyCarPayload {
  category: "safety_car" | "vsc" | "red_flag";
  deployedLap: number | null;
  /**
   * The original race-control message text (e.g. "SAFETY CAR DEPLOYED",
   * "SAFETY CAR IN THIS LAP", "VIRTUAL SAFETY CAR ENDING", "RED FLAG").
   * Missing since Checkpoint 3, inconsistent with FlagPayload/
   * SessionStatusPayload which both carry it — found while deriving
   * `RaceControlMessage.message` rows from LiveEvents at Checkpoint 4
   * (docs/CONTEXT.md §9), since that derivation has no other access to the
   * raw provider text.
   */
  message: string;
}

/** category="Flag" race control messages that aren't Safety Car/VSC/Red Flag — ordinary yellow/double-yellow/green/chequered. */
export interface FlagPayload {
  flag: string;
  scope: string | null;
  sector: number | null;
  message: string;
}

/** Session status transitions (SESSION STARTED/ABORTED/FINISHED) — also drives Session.status updates, not just a display message. */
export interface SessionStatusPayload {
  status: "started" | "aborted" | "finished" | "other";
  message: string;
}

/** Generic fallback for race control categories with no dedicated payload shape (e.g. "CarEvent", "Other") — see docs/CONTEXT.md §7.4.4. */
export interface RaceControlMessagePayload {
  category: string;
  message: string;
  driverId: string | null;
}

export const F1_EVENT_TYPES = [
  "LAP_COMPLETED",
  "PIT_STOP",
  "POSITION_CHANGE",
  "FASTEST_LAP",
  "SAFETY_CAR",
  "FLAG",
  "SESSION_STATUS",
  "RACE_CONTROL_MESSAGE",
] as const;

export type F1EventType = (typeof F1_EVENT_TYPES)[number];
