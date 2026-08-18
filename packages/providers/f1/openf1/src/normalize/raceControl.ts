import type { LiveEvent, f1 } from "@sports/domain";
import type { OpenF1RaceControlMessage } from "../types";
import { F1_SPORT_ID, buildDriverId, buildSessionId, deterministicHash } from "../reference";

/**
 * Plain-object shape matching the `RaceControlMessage` Prisma model — this
 * package never imports `@sports/db` (provider boundary rule), so ingestion
 * (Checkpoint 5) is responsible for the actual write; this is just the
 * normalized row shape.
 */
export interface NormalizedRaceControlMessage {
  sessionId: string;
  timestamp: string;
  category: f1.RaceControlCategory;
  message: string;
}

type Classification =
  | { category: "safety_car" | "vsc" | "red_flag"; eventType: "SAFETY_CAR" }
  | { category: "flag"; eventType: "FLAG" }
  | { category: "message"; eventType: "SESSION_STATUS" | "RACE_CONTROL_MESSAGE" };

/**
 * The core normalization decision of this checkpoint. Verified against real
 * `race_control` responses (2023 Australian GP, session_key 7787 — two
 * genuine red flags; Belgium 2024, session_key 9574 — ordinary flags and DRS
 * toggles). See docs/CONTEXT.md §8 for the full verification trail.
 *
 * Critically: `category="SafetyCar"` covers BOTH full Safety Car and Virtual
 * Safety Car — they're only distinguished by `message` text, never by
 * category. And Red Flag is `category="Flag", flag="RED"` — NOT
 * `category="SafetyCar"`, and NOT `category="SessionStatus"` as a Checkpoint
 * 2 assumption (based on doc prose, not real data) had guessed. Do not
 * "simplify" this by trusting `category` alone.
 */
export function classifyRaceControl(msg: OpenF1RaceControlMessage): Classification {
  if (msg.category === "SafetyCar") {
    const isVsc = /VIRTUAL SAFETY CAR/i.test(msg.message);
    return { category: isVsc ? "vsc" : "safety_car", eventType: "SAFETY_CAR" };
  }

  if (msg.category === "Flag" && msg.flag === "RED") {
    return { category: "red_flag", eventType: "SAFETY_CAR" };
  }

  if (msg.category === "Flag") {
    return { category: "flag", eventType: "FLAG" };
  }

  if (msg.category === "SessionStatus") {
    return { category: "message", eventType: "SESSION_STATUS" };
  }

  // "CarEvent", "Drs", "Other", and anything unrecognized in the future —
  // deliberate generic fallback so nothing is silently dropped (Checkpoint 2
  // §7.4.4: "every event type should have a reason to exist" applied in
  // reverse — every provider message needs *somewhere* to land).
  return { category: "message", eventType: "RACE_CONTROL_MESSAGE" };
}

function toSessionStatus(message: string): f1.SessionStatusPayload["status"] {
  if (message === "SESSION STARTED") return "started";
  if (message === "SESSION ABORTED") return "aborted";
  if (message === "SESSION FINISHED") return "finished";
  return "other";
}

export function toRaceControlMessageRow(
  msg: OpenF1RaceControlMessage,
  sessionId: string,
): NormalizedRaceControlMessage {
  return {
    sessionId,
    timestamp: msg.date,
    category: classifyRaceControl(msg).category,
    message: msg.message,
  };
}

export function normalizeRaceControlEvent(
  msg: OpenF1RaceControlMessage,
  input: { sessionId?: string },
): LiveEvent {
  const sessionId = input.sessionId ?? buildSessionId(msg.session_key);
  const classification = classifyRaceControl(msg);
  const hash = deterministicHash(`${msg.date}|${msg.category}|${msg.message}`);

  const base = {
    id: `openf1-race-control-${msg.session_key}-${hash}`,
    sportId: F1_SPORT_ID,
    sessionId,
    timestamp: msg.date,
    source: "openf1",
  };

  // `LiveEvent<TPayload>` is generic over each specific payload interface;
  // `LiveEvent` (this function's return type) defaults to
  // `LiveEvent<Record<string, unknown>>`, which plain payload interfaces
  // aren't structurally assignable to (no index signature). The cast at each
  // return is a known TS variance limitation, not a runtime type hole — every
  // payload shape here is checked against its own interface via `satisfies`
  // first.
  if (classification.eventType === "SAFETY_CAR") {
    const payload = {
      category: classification.category,
      deployedLap: msg.lap_number,
      message: msg.message,
    } satisfies f1.SafetyCarPayload;
    return { ...base, eventType: classification.eventType, payload } as LiveEvent;
  }

  if (classification.eventType === "FLAG") {
    const payload = {
      flag: msg.flag ?? "UNKNOWN",
      scope: msg.scope,
      sector: msg.sector,
      message: msg.message,
    } satisfies f1.FlagPayload;
    return { ...base, eventType: classification.eventType, payload } as LiveEvent;
  }

  if (classification.eventType === "SESSION_STATUS") {
    const payload = {
      status: toSessionStatus(msg.message),
      message: msg.message,
    } satisfies f1.SessionStatusPayload;
    return { ...base, eventType: classification.eventType, payload } as LiveEvent;
  }

  const payload = {
    category: msg.category,
    message: msg.message,
    driverId: msg.driver_number !== null ? buildDriverId(msg.driver_number) : null,
  } satisfies f1.RaceControlMessagePayload;
  return { ...base, eventType: classification.eventType, payload } as LiveEvent;
}
