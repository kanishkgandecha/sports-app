/**
 * F1 extension of the core domain model (ARCHITECTURE.md §5). A driver is a
 * Player, a constructor is a Team; everything below is what's specific to a
 * race weekend.
 */

export type F1SessionType =
  | "FP1"
  | "FP2"
  | "FP3"
  | "QUALIFYING"
  | "SPRINT_QUALIFYING"
  | "SPRINT"
  | "RACE";

export type TyreCompound = "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET";

export type DriverSessionState = "running" | "out" | "dnf" | "dsq" | "dns";

export interface DriverTiming {
  id: string;
  sessionId: string;
  driverId: string;
  position: number;
  gapToLeader: string | null;
  lastLapTime: string | null;
  bestLapTime: string | null;
  sector1: string | null;
  sector2: string | null;
  sector3: string | null;
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
}

export const F1_EVENT_TYPES = [
  "LAP_COMPLETED",
  "PIT_STOP",
  "POSITION_CHANGE",
  "FASTEST_LAP",
  "SAFETY_CAR",
] as const;

export type F1EventType = (typeof F1_EVENT_TYPES)[number];
