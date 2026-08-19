import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";
import type { cricket, Player, Team } from "@sports/domain";
import { config } from "../config";
import { logger } from "../logger";
import { publishLiveEvent } from "../publish";
import { bootstrapCricketDiscovery, bootstrapCricketMetadata, type CricketCompetitionSeasonPair } from "./bootstrap";
import { getActiveCricketSessions } from "./activeSessions";
import {
  upsertCricketBattingFigure,
  upsertCricketBowlingFigure,
  upsertCricketFixtureDetail,
  upsertCricketInningsState,
  upsertCricketRoster,
} from "./persist";

/**
 * `getInningsState`/`getFixtureDetail`/`getScorecard`/`getRosterForFixture`
 * are bonus methods on `CricketDataAdapter`, deliberately not on the
 * shared `SportsProvider` interface — same reasoning and pattern as F1's
 * `getDriverTimingPatches` (`CurrentStateCapableProvider` in
 * `../f1/job.ts`): current-state shapes are genuinely sport-specific, and
 * widening the shared interface for a capability other sports won't share
 * the shape of isn't worth it. All four are grouped into this one check —
 * `CricketDataAdapter` always has all four together, and a provider with
 * only some of them isn't a real scenario this needs to handle separately.
 */
interface CricketStateCapableProvider extends SportsProvider {
  getInningsState(fixtureId: string): Promise<cricket.CricketInningsState[]>;
  getFixtureDetail(fixtureId: string): Promise<cricket.CricketFixtureDetail | undefined>;
  getScorecard(
    fixtureId: string,
  ): Promise<Array<{ sessionId: string; batting: cricket.CricketBattingFigure[]; bowling: cricket.CricketBowlingFigure[] } | undefined>>;
  getRosterForFixture(fixtureId: string): Promise<{ teams: Team[]; players: Player[] }>;
}

function hasCricketState(provider: SportsProvider): provider is CricketStateCapableProvider {
  const p = provider as Partial<CricketStateCapableProvider>;
  return (
    typeof p.getInningsState === "function" &&
    typeof p.getFixtureDetail === "function" &&
    typeof p.getScorecard === "function" &&
    typeof p.getRosterForFixture === "function"
  );
}

/**
 * Cricket Checkpoint 4 (request-budget remediation) — `CricketDataAdapter`'s
 * bonus `getRequestBudgetStatus()`, checked before spending any further
 * real requests this tick. Not part of `SportsProvider` (same "bonus
 * method, checked via typeof" pattern as `hasCricketState` above) — a
 * plain test double that doesn't report usage is treated as "unknown," not
 * "exhausted": this can only ever gate on usage it actually knows about.
 */
interface BudgetReportingProvider extends SportsProvider {
  getRequestBudgetStatus(): { hitsToday: number; hitsLimit: number; observedAt: number } | undefined;
}

function hasRequestBudget(provider: SportsProvider): boolean {
  const p = provider as Partial<BudgetReportingProvider>;
  if (typeof p.getRequestBudgetStatus !== "function") return true;
  const status = p.getRequestBudgetStatus();
  if (!status) return true; // no real request observed yet this process — nothing known to gate on
  return status.hitsToday + config.cricketRequestSafetyMarginRequests < status.hitsLimit;
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
 * Orchestrates the Cricket job end to end. Cricket Checkpoint 4 restructured
 * this significantly (docs/CONTEXT.md's remediation section has the full
 * before/after audit) — three real, found-not-hypothetical bugs fixed here:
 *
 *  1. **Metadata (competitions/seasons) no longer re-fetches every tick.**
 *     It used to — `bootstrapCricketCurrent` (competitions+seasons+
 *     venues+teams+fixtures+sessions, all in one call) ran on every single
 *     30-minute tick, and competitions/seasons genuinely change on the
 *     order of days, not minutes. Split into `bootstrapCricketMetadata`
 *     (runs at startup, then only every `cricketMetadataRefreshIntervalMs`)
 *     and `bootstrapCricketDiscovery` (fixtures/sessions — free in steady
 *     state, safe every tick, and what actually keeps fixture status and
 *     newly-appearing matches current).
 *  2. **The double-bootstrap-at-startup bug.** The previous version called
 *     `bootstrapCricketCurrent` once explicitly, then immediately called
 *     `tick()` (which called it again) before the `setInterval` even
 *     started — two full bootstraps for one process start. `tick()` is
 *     now the only place bootstrap logic runs; `await tick()` before the
 *     `setInterval` call is what performs "the startup bootstrap," once.
 *  3. **No request-budget awareness.** `hasRequestBudget` (above) skips
 *     an entire tick's real provider calls once `CricketDataAdapter`'s
 *     own live-reported usage is within `cricketRequestSafetyMarginRequests`
 *     of `cricketDailyRequestBudget` — logged, not silent, and never
 *     throws or stops the process; the next tick tries again (usage
 *     resets daily on the provider's side).
 */
export interface CricketTickState {
  knownPairs: CricketCompetitionSeasonPair[];
  /** 0 forces a metadata bootstrap on the very first tick. */
  lastMetadataRefresh: number;
  cursors: Map<string, string>;
  /** fixtureId -> last time getInningsState/getFixtureDetail actually ran — separate from `cursors` (pollLiveEvents' per-session `since` cursor) because this is fixture-scoped and on a slower cadence. */
  lastStateRefresh: Map<string, number>;
}

export function initialCricketTickState(): CricketTickState {
  return { knownPairs: [], lastMetadataRefresh: 0, cursors: new Map(), lastStateRefresh: new Map() };
}

/**
 * One tick's worth of work, extracted from `runCricketJob` so it's
 * directly testable without a real `setInterval` loop (Cricket Checkpoint
 * 4 — the request-budget guard specifically needed this: "under budget",
 * "near the limit", and "exhausted" are all real, distinct behaviors this
 * function has, and they need real test coverage, not just a comment
 * claiming they exist).
 */
export async function runCricketTickOnce(provider: SportsProvider, state: CricketTickState): Promise<void> {
  if (!hasRequestBudget(provider)) {
    const status = (provider as Partial<BudgetReportingProvider>).getRequestBudgetStatus?.();
    logger.warn(
      { hitsToday: status?.hitsToday, hitsLimit: status?.hitsLimit, margin: config.cricketRequestSafetyMarginRequests },
      "Cricket request budget near/at the daily limit — skipping this tick's CricketData.org calls entirely",
    );
    return;
  }

  try {
    if (Date.now() - state.lastMetadataRefresh >= config.cricketMetadataRefreshIntervalMs) {
      const metadata = await bootstrapCricketMetadata(provider);
      state.knownPairs = metadata.pairs;
      state.lastMetadataRefresh = Date.now();
      logger.info({ competitions: metadata.competitions, seasons: metadata.seasons }, "Cricket metadata bootstrap complete");
    }

    const discovery = await bootstrapCricketDiscovery(provider, state.knownPairs);
    logger.info(discovery, "Cricket current-match discovery complete");
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "Cricket bootstrap tick failed");
  }

  try {
    const sessions = await prisma.session.findMany({
      where: { fixture: { sport: { slug: provider.sportId } } },
      select: { id: true, startTime: true, endTime: true },
    });
    await pollActiveCricketSessions(provider, getActiveCricketSessions(sessions), state.cursors, state.lastStateRefresh);
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "failed to load sessions for active-session selection");
  }
}

export async function runCricketJob(provider: SportsProvider): Promise<void> {
  logger.info("Cricket job starting");
  const state = initialCricketTickState();
  await runCricketTickOnce(provider, state);
  setInterval(() => runCricketTickOnce(provider, state), config.cricketPollIntervalMs);
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
    if (!hasRequestBudget(provider)) {
      logger.warn({ sessionId: target.sessionId }, "Cricket request budget near/at the daily limit — skipping remaining sessions this tick");
      return;
    }
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
    // All four calls below now genuinely share one real `match_info` call
    // and one real `match_scorecard` call — `CricketDataAdapter`'s
    // request-level cache (Cricket Checkpoint 4) is what makes that true;
    // before that fix, this same `Promise.all` made 4 separate real
    // `match_info` requests for this one `fixtureId`, not 1 — see
    // docs/CONTEXT.md's remediation section for the full audit that found
    // it and the concurrency-safety reasoning behind the fix.
    const [states, scorecard, roster] = await Promise.all([
      provider.getInningsState(fixtureId),
      provider.getScorecard(fixtureId),
      provider.getRosterForFixture(fixtureId),
      provider.getFixtureDetail(fixtureId).then((detail) => detail && upsertCricketFixtureDetail(detail)),
    ]);

    await upsertCricketRoster(provider.sportId, roster.teams, roster.players);

    for (const state of states) {
      await upsertCricketInningsState(state);
    }
    for (const innings of scorecard) {
      if (!innings) continue;
      for (const figure of innings.batting) await upsertCricketBattingFigure(figure);
      for (const figure of innings.bowling) await upsertCricketBowlingFigure(figure);
    }

    lastStateRefresh.set(fixtureId, Date.now());
    stateRefreshed = true;
  }

  logger.info(
    { sessionId, eventsPublished: createdCount, eventsSeen: events.length, stateRefreshed },
    "Cricket session polled",
  );
}
