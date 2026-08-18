import type { f1 } from "@sports/domain";

type F1SessionType = f1.F1SessionType;

// Verified against real `sessions` responses across 2023-2025 (see
// docs/CONTEXT.md §8). `session_type` is coarse ("Practice" covers FP1-3);
// `session_name` is what actually distinguishes them — provider terminology
// does not match ours 1:1, exactly as flagged at Checkpoint 2.
const SESSION_NAME_MAP: Record<string, F1SessionType> = {
  "Practice 1": "FP1",
  "Practice 2": "FP2",
  "Practice 3": "FP3",
  Qualifying: "QUALIFYING",
  "Sprint Qualifying": "SPRINT_QUALIFYING",
  Sprint: "SPRINT",
  Race: "RACE",
};

/**
 * Maps OpenF1's `session_name` to our `F1SessionType`. Falls back to a
 * normalized version of the raw name for anything unrecognized (rather than
 * throwing) so one new/renamed session type from the provider doesn't take
 * the whole ingestion run down — logged so it doesn't go unnoticed.
 */
export function mapSessionType(sessionName: string): F1SessionType | string {
  const mapped = SESSION_NAME_MAP[sessionName];
  if (mapped) return mapped;
  console.warn(`[openf1] Unrecognized session_name "${sessionName}" — passing through unmapped`);
  return sessionName.toUpperCase().replace(/\s+/g, "_");
}
