import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";
import type { cricket } from "@sports/domain";
import { config } from "../config";
import { logger } from "../logger";
import { publishLiveEvent } from "../publish";
import { bootstrapCricketCurrent } from "./bootstrap";
import { getActiveCricketSessions } from "./activeSessions";
import { upsertCricketFixtureDetail, upsertCricketInningsState } from "./persist";

/**
 * `getInningsState`/`getFixtureDetail` are bonus methods on
 * `CricketDataAdapter`, deliberately not on the shared `SportsProvider`
 * interface — same reasoning and pattern as F1's `getDriverTimingPatches`
 * (`CurrentStateCapableProvider` in `../f1/job.ts`): current-state shapes
 * are genuinely sport-specific, and widening the shared interface for a
 * capability other sports won't share the shape of isn't worth it.
 */
interface CricketStateCapableProvider extends SportsProvider {
  getInningsState(fixtureId: string): Promise<cricket.CricketInningsState[]>;
  getFixtureDetail(fixtureId: string): Promise<cricket.CricketFixtureDetail | undefined>;
}

function hasCricketState(provider: SportsProvider): provider is CricketStateCapableProvider {
  return (
    typeof (provider as Partial<CricketStateCapableProvider>).getInningsState === "function" &&
    typeof (provider as Partial<CricketStateCapableProvider>).getFixtureDetail === "function"
  );
}

function fixtureIdFromSessionId(sessionId: string): string {
  // "cricket-match-{matchId}-innings-{N}" -> "cricket-match-{matchId}" —
  // string-level, not `sessionRefFromId` (that's provider-package-internal
  // — see reference.ts's own provider-boundary rule; ingestion depends
  // only on the shared `SportsProvider` interface, never a specific
  // adapter's internals).
  return sessionId.replace(/-innings-\d+$/, "");
}

/**
 * Orchestrates the Cricket job end to end: bootstrap current matches once
 * at startup, then repeatedly select active (live) innings sessions and
 * poll only those — same shape as `runF1Job`, deliberately, since nothing
 * about this part of the architecture is F1-specific. What IS different,
 * and real: `getInningsState`/`getFixtureDetail` refresh on their own,
 * much slower cadence (`cricketInningsStateIntervalMs`) than the base poll
 * tick, tracked per-fixture — the real rate-limit discipline this
 * checkpoint's adapter/config doc comments describe, made concrete here.
 */
export async function runCricketJob(provider: SportsProvider): Promise<void> {
  logger.info("Cricket job starting — bootstrapping current matches");
  try {
    const summary = await bootstrapCricketCurrent(provider);
    logger.info(summary, "Cricket current-matches bootstrap complete");
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "Cricket bootstrap failed");
  }

  const cursors = new Map<string, string>();
  // fixtureId -> last time getInningsState/getFixtureDetail actually ran —
  // separate from `cursors` (which tracks pollLiveEvents' per-session
  // `since` cursor) because this is fixture-scoped and on a slower cadence.
  const lastStateRefresh = new Map<string, number>();

  const tick = async () => {
    try {
      // Re-bootstrap every tick — cheap (the adapter's own
      // `getCachedCurrentMatches` TTL means this often costs zero extra
      // real requests if the interval is shorter than the cache TTL, and
      // exactly one when it's not), and this is how a fixture's status
      // (scheduled -> live -> completed) and new matches actually get
      // picked up without a separate bootstrap-only interval.
      await bootstrapCricketCurrent(provider);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "Cricket bootstrap refresh failed");
    }

    try {
      const sessions = await prisma.session.findMany({
        where: { fixture: { sport: { slug: provider.sportId } } },
        select: { id: true, startTime: true, endTime: true },
      });
      await pollActiveCricketSessions(provider, getActiveCricketSessions(sessions), cursors, lastStateRefresh);
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "failed to load sessions for active-session selection");
    }
  };

  await tick();
  setInterval(tick, config.cricketPollIntervalMs);
}

export async function pollActiveCricketSessions(
  provider: SportsProvider,
  activeTargets: { sessionId: string; reason: string }[],
  cursors: Map<string, string>,
  lastStateRefresh: Map<string, number>,
): Promise<void> {
  if (activeTargets.length === 0) {
    logger.debug("no active Cricket sessions this tick");
    return;
  }

  for (const target of activeTargets) {
    try {
      await pollOneSession(provider, target.sessionId, cursors, lastStateRefresh);
    } catch (error) {
      // One session's failure must not stop the others in this same tick —
      // same isolation as F1's `pollActiveSessions`.
      logger.error(
        { sessionId: target.sessionId, reason: target.reason, error: error instanceof Error ? error.message : String(error) },
        "Cricket session poll failed",
      );
    }
  }
}

async function pollOneSession(
  provider: SportsProvider,
  sessionId: string,
  cursors: Map<string, string>,
  lastStateRefresh: Map<string, number>,
): Promise<void> {
  const since = cursors.get(sessionId);
  const events = await provider.pollLiveEvents({ sessionId, since });

  let createdCount = 0;
  let latestTimestamp = since;
  for (const event of events) {
    const { created } = await publishLiveEvent(event);
    if (created) createdCount += 1;
    if (!latestTimestamp || event.timestamp > latestTimestamp) {
      latestTimestamp = event.timestamp;
    }
  }
  if (latestTimestamp) cursors.set(sessionId, latestTimestamp);

  const fixtureId = fixtureIdFromSessionId(sessionId);
  let stateRefreshed = false;
  const lastRefresh = lastStateRefresh.get(fixtureId) ?? 0;
  if (hasCricketState(provider) && Date.now() - lastRefresh >= config.cricketInningsStateIntervalMs) {
    const [states] = await Promise.all([
      provider.getInningsState(fixtureId),
      provider
        .getFixtureDetail(fixtureId)
        .then((detail) => detail && upsertCricketFixtureDetail(detail)),
    ]);
    for (const state of states) {
      await upsertCricketInningsState(state);
    }
    lastStateRefresh.set(fixtureId, Date.now());
    stateRefreshed = true;
  }

  logger.info(
    { sessionId, eventsPublished: createdCount, eventsSeen: events.length, stateRefreshed },
    "Cricket session polled",
  );
}

