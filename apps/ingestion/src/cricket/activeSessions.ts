import { config } from "../config";
import { classifySessionState, type SessionForScheduling, type ActiveSessionTarget } from "../f1/activeSessions";

/**
 * Reuses `classifySessionState` (`../f1/activeSessions.ts`) as-is — it was
 * already sport-agnostic (built on `@sports/domain`'s
 * `classifySessionLifecycle`, taking a plain `maxDurationMs` parameter, no
 * F1-specific logic) — this is exactly the kind of genuine cross-sport
 * reuse this checkpoint's "do not redesign the existing F1 architecture
 * unless a genuine cross-sport issue requires it" rule expects, not a
 * reason to fork a second copy. Only the config values (Cricket's own,
 * much longer `cricketMaxSessionDurationMs`/`cricketPollIntervalMs` — see
 * config.ts's doc comments on why) are Cricket-specific.
 */
export function getActiveCricketSessions(
  sessions: SessionForScheduling[],
  now: Date = new Date(),
): ActiveSessionTarget[] {
  return sessions
    .filter((session) => classifySessionState(session, now, config.cricketMaxSessionDurationMs) === "live")
    .map((session) => {
      const minutesRunning = Math.round((now.getTime() - session.startTime.getTime()) / 60000);
      return {
        sessionId: session.id,
        reason: `innings started ${minutesRunning}min ago and hasn't reached its end time`,
        pollIntervalMs: config.cricketPollIntervalMs,
      };
    });
}
