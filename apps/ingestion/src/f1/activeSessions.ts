import { config } from "../config";

export type SessionLifecycleState = "upcoming" | "live" | "completed";

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
 * adapter (this checkpoint's explicit requirement). Recomputes from
 * `startTime`/`endTime` against wall-clock time rather than trusting a
 * stored `status` column, which bootstrap sets once and never refreshes —
 * see docs/CONTEXT.md §9 "Active polling" for why that staleness risk
 * matters here specifically.
 */
export function classifySessionState(
  session: SessionForScheduling,
  now: Date,
  maxDurationMs: number = config.f1MaxSessionDurationMs,
): SessionLifecycleState {
  const start = session.startTime;
  const cappedEnd = session.endTime ?? new Date(start.getTime() + maxDurationMs);
  const effectiveEnd = new Date(Math.min(cappedEnd.getTime(), start.getTime() + maxDurationMs));

  if (now < start) return "upcoming";
  if (now > effectiveEnd) return "completed";
  return "live";
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
