import { classifySessionLifecycle, type Session as DomainSession } from "@sports/domain";
import { config } from "../config";

export type SessionLifecycleState = ReturnType<typeof classifySessionLifecycle>;

export interface SessionForScheduling {
  id: string;
  startTime: Date;
  endTime: Date | null;
}

export interface ActiveSessionTarget {
  sessionId: string;
  reason: string;
  pollIntervalMs: number;
}

/**
 * Pure, isolated, testable — deliberately not buried in the provider
 * adapter (Checkpoint 4's explicit requirement). Thin wrapper over the
 * shared `classifySessionLifecycle` (moved to `@sports/domain` at
 * Checkpoint 5 so `apps/api`'s F1 routes compute session liveness the same
 * way instead of re-deriving their own version — docs/CONTEXT.md §10) that
 * just adapts this module's `Date`-typed scheduling shape to the domain
 * function's `string`-typed `Session` shape and supplies ingestion's own
 * configured max-duration default.
 */
export function classifySessionState(
  session: SessionForScheduling,
  now: Date,
  maxDurationMs: number = config.f1MaxSessionDurationMs,
): SessionLifecycleState {
  const asDomainSession: Pick<DomainSession, "startTime" | "endTime"> = {
    startTime: session.startTime.toISOString(),
    endTime: session.endTime ? session.endTime.toISOString() : null,
  };
  return classifySessionLifecycle(asDomainSession, now, maxDurationMs);
}

/**
 * Answers exactly what this checkpoint asks for: which sessions need
 * polling, why, and at what cadence. Only "live" sessions are returned —
 * upcoming and completed sessions are classifiable (see
 * `classifySessionState`) but never actively polled, so a full historical
 * calendar bootstrap doesn't turn into continuous polling of ~100 sessions.
 */
export function getActiveF1Sessions(
  sessions: SessionForScheduling[],
  now: Date = new Date(),
): ActiveSessionTarget[] {
  return sessions
    .filter((session) => classifySessionState(session, now) === "live")
    .map((session) => {
      const minutesRunning = Math.round((now.getTime() - session.startTime.getTime()) / 60000);
      return {
        sessionId: session.id,
        reason: `session started ${minutesRunning}min ago and hasn't reached its end time`,
        pollIntervalMs: config.f1PollIntervalMs,
      };
    });
}
