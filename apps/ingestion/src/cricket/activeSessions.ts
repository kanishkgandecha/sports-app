import { config } from "../config";
import { logger } from "../logger";
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
 *
 * Cricket Checkpoint 4 (request-budget remediation) — `cricketMaxActiveSessions`
 * added: without a cap, request volume scales linearly and unbounded with
 * however many sessions the database currently classifies "live" (a real
 * risk — a real `currentMatches` snapshot this project captured had 18
 * matches in flight at once). Deterministic priority, not arbitrary
 * truncation: earliest-started sessions first (the ones that have been
 * live longest are the ones a real user is most likely mid-match on right
 * now), stable sort, and every session skipped purely because of the cap
 * is logged with which one and why — never a silent drop.
 */
export function getActiveCricketSessions(
  // Prisma's generated enum scalar is typed as `string` at this app
  // boundary. Unknown values are deliberately not treated as live below.
  sessions: Array<SessionForScheduling & { status: string }>,
  now: Date = new Date(),
): ActiveSessionTarget[] {
  const live = sessions
    // CricketData.org has no innings-specific timestamps, so each innings
    // shares the match start time. Its normalized per-innings status is the
    // authoritative lifecycle signal: prior score[] entries are completed;
    // only the final, in-progress entry is live. Wall-clock classification
    // remains a safety bound for stale/corrupt records, not the sole source
    // of truth as it is for F1.
    .filter(
      (session) =>
        session.status === "live" && classifySessionState(session, now, config.cricketMaxSessionDurationMs) === "live",
    )
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime() || a.id.localeCompare(b.id));

  const selected = live.slice(0, config.cricketMaxActiveSessions);
  const skipped = live.slice(config.cricketMaxActiveSessions);
  if (skipped.length > 0) {
    logger.warn(
      { skippedSessionIds: skipped.map((s) => s.id), cap: config.cricketMaxActiveSessions, liveCount: live.length },
      "Cricket active-session cap reached — skipping lowest-priority (most recently started) live sessions this tick",
    );
  }

  return selected.map((session) => {
    const minutesRunning = Math.round((now.getTime() - session.startTime.getTime()) / 60000);
    return {
      sessionId: session.id,
      reason: `provider-normalized innings status is live; started ${minutesRunning}min ago and hasn't reached its end time`,
      pollIntervalMs: config.cricketPollIntervalMs,
    };
  });
}
