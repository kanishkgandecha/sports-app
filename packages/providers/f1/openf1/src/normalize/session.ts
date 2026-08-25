import type { Session, SessionStatus } from "@sports/domain";
import type { OpenF1Session } from "../types";
import { buildSessionId } from "../reference";
import { mapSessionType } from "../sessionType";

/**
 * OpenF1 has no explicit session-status field — this is a genuine
 * normalization computation, not a passthrough (flagged at Checkpoint 2).
 * Live polling (Checkpoint 5) can refine this further using race_control's
 * SESSION STARTED/ABORTED/FINISHED messages; this date-based approximation
 * is what `getSessions()` (a one-shot registry read, not a live poll) uses.
 */
export function deriveSessionStatus(session: OpenF1Session, now: Date): SessionStatus {
  if (session.is_cancelled) return "cancelled";
  const start = new Date(session.date_start);
  const end = new Date(session.date_end);
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "live";
}

export function normalizeSession(
  session: OpenF1Session,
  input: { fixtureId: string; now?: Date },
): Session {
  return {
    id: buildSessionId(session.session_key),
    fixtureId: input.fixtureId,
    type: mapSessionType(session.session_name),
    status: deriveSessionStatus(session, input.now ?? new Date()),
    startTime: session.date_start,
    endTime: session.date_end,
  };
}
